#include <Arduino.h>

#include <LbmWm1110.hpp>
#include <Lbmx.hpp>
#include <Lbm_Modem_Common.hpp>

#include <WM1110_Geolocation.hpp>
#include <WM1110_BLE.hpp>
#include <WM1110_Storage.hpp>
#include <WM1110_At_Config.hpp>
#include <Tracker_Peripheral.hpp>

#include <TinyGPSPlus.h>
#include <cstring>
#include <cmath>

static constexpr uint32_t SENSOR_READ_PERIOD_MS = 60 * 1000;
static constexpr uint32_t EXECUTION_PERIOD      = 50;

enum class FIFReadPolicy {
  EveryCycle,
  PrimeOnce,
  ExternalEvent
};

class FIFSensor {
public:
  virtual ~FIFSensor() = default;
  virtual void begin() {}
  virtual void read() = 0;
  virtual FIFReadPolicy policy() const = 0;
};

class FIFUARTGPS : public FIFSensor {
public:
  void begin() override {
    Serial1.begin(9600);
    delay(200);
  }

  void read() override {
    while (Serial1.available() > 0) {
      gps_.encode(Serial1.read());
      bytesSeen_++;
    }

    if (gps_.location.isValid()) {
      hasFix_ = true;
      lat_ = gps_.location.lat();
      lon_ = gps_.location.lng();
    }

    if (gps_.altitude.isValid()) {
      alt_ = gps_.altitude.meters();
    }

    if (gps_.satellites.isValid()) {
      sats_ = gps_.satellites.value();
    }

    if (gps_.hdop.isValid()) {
      hdop_ = gps_.hdop.hdop();
    }
  }

  FIFReadPolicy policy() const override {
    return FIFReadPolicy::EveryCycle;
  }

  bool hasFix() const { return hasFix_; }
  double lat() const { return lat_; }
  double lon() const { return lon_; }
  double alt() const { return alt_; }
  uint32_t sats() const { return sats_; }
  double hdop() const { return hdop_; }
  uint32_t bytesSeen() const { return bytesSeen_; }

private:
  TinyGPSPlus gps_;
  bool hasFix_ = false;
  double lat_ = 0.0;
  double lon_ = 0.0;
  double alt_ = 0.0;
  uint32_t sats_ = 0;
  double hdop_ = 99.9;
  uint32_t bytesSeen_ = 0;
};

class FIFAccelerometer : public FIFSensor {
public:
  explicit FIFAccelerometer(Tracker_Peripheral& tp) : tp_(tp) {}

  void read() override {
    tp_.measureLIS3DHTRDatas(&x_, &y_, &z_);
  }

  FIFReadPolicy policy() const override {
    return FIFReadPolicy::EveryCycle;
  }

private:
  Tracker_Peripheral& tp_;
  float x_ = 0.0f;
  float y_ = 0.0f;
  float z_ = 0.0f;
};

class FIFBatteryMonitoring : public FIFSensor {
public:
  explicit FIFBatteryMonitoring(Tracker_Peripheral& tp) : tp_(tp) {}

  void read() override {
    if (primed_) return;
    primed_ = true;
  }

  FIFReadPolicy policy() const override {
    return FIFReadPolicy::PrimeOnce;
  }

private:
  Tracker_Peripheral& tp_;
  bool primed_ = false;
};

class FIFDevBoard {
public:
  FIFDevBoard(Tracker_Peripheral& tracker,
              WM1110_Geolocation& geo,
              FIFUARTGPS& uartGps,
              FIFSensor** sensors,
              size_t sensorCount)
    : tracker_(tracker),
      geo_(geo),
      uartGps_(uartGps),
      sensors_(sensors),
      sensorCount_(sensorCount) {}

  void begin() {
    wm1110_storage.begin();
    wm1110_storage.loadBootConfigParameters();

    delay(1000);

    wm1110_ble.begin();
    wm1110_ble.setName();
    wm1110_ble.setStartParameters();
    wm1110_ble.startAdv();

    tracker_.begin();
    tracker_.setUserButton();

    geo_.begin(Track_Scan_Gps, true);
    wm1110_at_config.begin();

    for (size_t i = 0; i < sensorCount_; ++i) {
      if (sensors_[i]) sensors_[i]->begin();
    }

    primeStaleSensorsOnce();
    geo_.run();
  }

  void collectAndQueueNativeSensorUplink() {
    for (size_t i = 0; i < sensorCount_; ++i) {
      if (!sensors_[i]) continue;

      switch (sensors_[i]->policy()) {
        case FIFReadPolicy::EveryCycle:
          sensors_[i]->read();
          break;
        case FIFReadPolicy::PrimeOnce:
          break;
        case FIFReadPolicy::ExternalEvent:
          break;
      }
    }

    if (!stalePrimed_) {
      primeStaleSensorsOnce();
    }

    tracker_.packUplinkSensorDatas();
    tracker_.getUplinkSensorDatas(sensorBuf_, &sensorSize_);

    Serial.print("QUEUEING NATIVE SENSOR UPLINK, bytes=");
    Serial.println(sensorSize_);

    geo_.insertIntoTxQueue(sensorBuf_, sensorSize_);
  }

  void collectAndQueueCustomGpsUplink() {
    if (!uartGps_.hasFix()) {
      Serial.println("Skipping custom GPS uplink: no fix");
      return;
    }

    uint8_t customPayload[8] = {0};

    uint32_t lon_u = static_cast<uint32_t>(lround((uartGps_.lon() + 180.0) * 1000000.0));
    uint32_t lat_u = static_cast<uint32_t>(lround((uartGps_.lat() +  90.0) * 1000000.0));

    customPayload[0] = (lon_u >> 24) & 0xFF;
    customPayload[1] = (lon_u >> 16) & 0xFF;
    customPayload[2] = (lon_u >> 8)  & 0xFF;
    customPayload[3] =  lon_u        & 0xFF;

    customPayload[4] = (lat_u >> 24) & 0xFF;
    customPayload[5] = (lat_u >> 16) & 0xFF;
    customPayload[6] = (lat_u >> 8)  & 0xFF;
    customPayload[7] =  lat_u        & 0xFF;

    if (!tracker_.packUplinkCustomDatas(customPayload, sizeof(customPayload))) {
      Serial.println("packUplinkCustomDatas failed");
      return;
    }

    tracker_.getUplinkCustomDatas(customBuf_, &customSize_);

    Serial.print("QUEUEING CUSTOM GPS UPLINK, bytes=");
    Serial.println(customSize_);

    Serial.print("GPS raw lon=");
    Serial.print(uartGps_.lon(), 6);
    Serial.print(" lat=");
    Serial.println(uartGps_.lat(), 6);

    Serial.print("GPS encoded lon_u=");
    Serial.print(lon_u);
    Serial.print(" lat_u=");
    Serial.println(lat_u);

    Serial.print("Custom payload hex: ");
    for (uint8_t i = 0; i < customSize_; ++i) {
      if (customBuf_[i] < 0x10) Serial.print('0');
      Serial.print(customBuf_[i], HEX);
      Serial.print(' ');
    }
    Serial.println();

    geo_.insertIntoTxQueue(customBuf_, customSize_);
  }

  WM1110_Geolocation& geo() { return geo_; }
  Tracker_Peripheral& tracker() { return tracker_; }
  FIFUARTGPS& uartGps() { return uartGps_; }

private:
  void primeStaleSensorsOnce() {
    if (stalePrimed_) return;

    tracker_.measureSHT4xDatas(&temperature_, &humidity_);

    for (size_t i = 0; i < sensorCount_; ++i) {
      if (!sensors_[i]) continue;
      if (sensors_[i]->policy() == FIFReadPolicy::PrimeOnce) {
        sensors_[i]->read();
      }
    }

    stalePrimed_ = true;
  }

private:
  Tracker_Peripheral& tracker_;
  WM1110_Geolocation& geo_;
  FIFUARTGPS& uartGps_;
  FIFSensor** sensors_ = nullptr;
  size_t sensorCount_ = 0;

  bool stalePrimed_ = false;
  float temperature_ = 0.0f;
  float humidity_ = 0.0f;

  uint8_t sensorBuf_[64] = {0};
  uint8_t sensorSize_ = 0;

  uint8_t customBuf_[64] = {0};
  uint8_t customSize_ = 0;
};

static Tracker_Peripheral tracker;
static WM1110_Geolocation& geo = WM1110_Geolocation::getInstance();

static FIFUARTGPS uartGps;
static FIFAccelerometer accel(tracker);
static FIFBatteryMonitoring batt(tracker);

static FIFSensor* sensorList[] = {
  &accel,
  &batt,
  &uartGps
};

static FIFDevBoard board(
  tracker,
  geo,
  uartGps,
  sensorList,
  sizeof(sensorList) / sizeof(sensorList[0])
);

uint32_t consume_time = 0;
uint32_t start_sensor_read_time = 0;
uint32_t sensor_read_period = 0;

bool button_press_flag = false;
bool button_trig_collect = false;

bool shock_flag = false;
bool shock_trig_collect = false;

void trigger_collect_action() {
  board.tracker().getUserButtonIrqStatus(&button_press_flag);
  if (button_press_flag) {
    if (!button_trig_collect) {
      button_trig_collect = true;
      board.tracker().setSensorEventStatus(TRACKER_STATE_BIT0_SOS);
    }
    board.tracker().clearUserButtonFlag();
  }

  board.tracker().getLIS3DHTRIrqStatus(&shock_flag);
  if (shock_flag) {
    if (!shock_trig_collect) {
      shock_trig_collect = true;
      board.tracker().setSensorEventStatus(TRACKER_STATE_BIT5_DEV_SHOCK);
    }
    board.tracker().clearShockFlag();
  }
}

void setup() {
  board.begin();
  sensor_read_period = SENSOR_READ_PERIOD_MS;

  Serial.print("Sensor read period ms = ");
  Serial.println(sensor_read_period);
}

void loop() {
  uint32_t now_time = 0;

  uint32_t sleepTime = board.geo().lbmxProcess();
  board.geo().modemLedActionProcess();

  board.uartGps().read();

  static uint32_t lastGpsPrint = 0;
  if (millis() - lastGpsPrint > 3000) {
    lastGpsPrint = millis();

    Serial.print("GPS bytes=");
    Serial.print(board.uartGps().bytesSeen());

    if (board.uartGps().hasFix()) {
      Serial.print(" FIX lat=");
      Serial.print(board.uartGps().lat(), 6);
      Serial.print(", lon=");
      Serial.print(board.uartGps().lon(), 6);
      Serial.print(" sats=");
      Serial.print(board.uartGps().sats());
      Serial.print(" alt=");
      Serial.print(board.uartGps().alt(), 1);
      Serial.print(" hdop=");
      Serial.println(board.uartGps().hdop(), 1);
    } else {
      Serial.println(" no-fix");
    }
  }

  static uint32_t lastSyncPrint = 0;
  if (millis() - lastSyncPrint > 5000) {
    lastSyncPrint = millis();
    Serial.print("time_sync_flag=");
    Serial.println(board.geo().time_sync_flag ? "true" : "false");
  }

  if (board.geo().time_sync_flag == true) {
    trigger_collect_action();

    if (sleepTime > 500) {
      now_time = smtc_modem_hal_get_time_in_ms();

      if ((now_time - start_sensor_read_time > sensor_read_period) ||
          (start_sensor_read_time == 0) ||
          button_trig_collect ||
          shock_trig_collect) {

        Serial.print("UPLINK CONDITION MET at ");
        Serial.println(now_time);

        board.collectAndQueueNativeSensorUplink();
        board.collectAndQueueCustomGpsUplink();

        start_sensor_read_time = smtc_modem_hal_get_time_in_ms();
        consume_time = start_sensor_read_time - now_time;
        sleepTime = sleepTime - consume_time;

        button_trig_collect = false;
        shock_trig_collect = false;
      }
    }
  }

  static uint8_t cmd_data_buf[244] = {0};
  static uint8_t cmd_data_size = 0;

  if (wm1110_ble.getBleRecData(cmd_data_buf, &cmd_data_size)) {
    cmd_parse_type = 1;
    wm1110_at_config.parseCmd((char*)cmd_data_buf, cmd_data_size);
    memset(cmd_data_buf, 0, cmd_data_size);
    cmd_data_size = 0;
    cmd_parse_type = 0;
  }

  if (wm1110_ble.getBleStatus() == BleRunState::StateDisconnect) {
    smtc_modem_hal_reset_mcu();
  }

  delay(min(sleepTime, EXECUTION_PERIOD));
}