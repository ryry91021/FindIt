#include <Arduino.h>

#include <LbmWm1110.hpp>
#include <Lbmx.hpp>
#include <Lbm_Modem_Common.hpp>

#include <WM1110_Geolocation.hpp>
#include <WM1110_BLE.hpp>
#include <WM1110_Storage.hpp>
#include <WM1110_At_Config.hpp>
#include <Tracker_Peripheral.hpp>

// ------------------------------
// FIFSensor policy
// ------------------------------
enum class FIFReadPolicy {
  EveryCycle,
  PrimeOnce,
  ExternalEvent
};

// ------------------------------
// UML: FIFSensor (abstract)
// ------------------------------
class FIFSensor {
public:
  virtual ~FIFSensor() = default;

  virtual void read() = 0;
  virtual FIFReadPolicy policy() const = 0;

  // Optional debug payload view (not the SenseCAP uplink payload).
  virtual void toPayload(char* out, size_t outLen) {
    (void)out;
    (void)outLen;
  }
};

// ------------------------------
// UML: FIFAccelerometer
// ------------------------------
class FIFAccelerometer : public FIFSensor {
public:
  explicit FIFAccelerometer(Tracker_Peripheral& tp) : tp_(tp) {}

  void read() override {
    tp_.measureLIS3DHTRDatas(&x_, &y_, &z_);
  }

  FIFReadPolicy policy() const override {
    return FIFReadPolicy::EveryCycle;
  }

  void toPayload(char* out, size_t outLen) override {
    snprintf(out, outLen, "accel: x=%.3f y=%.3f z=%.3f", x_, y_, z_);
  }

private:
  Tracker_Peripheral& tp_;
  float x_ = 0.0f;
  float y_ = 0.0f;
  float z_ = 0.0f;
};

// ------------------------------
// UML: FIFBatteryMonitoring
// ------------------------------
class FIFBatteryMonitoring : public FIFSensor {
public:
  explicit FIFBatteryMonitoring(Tracker_Peripheral& tp) : tp_(tp) {}

  void read() override {
    if (primed_) return;

    // Replace this with the real Tracker_Peripheral battery API if available.
    // Example only:
    // tp_.measureBattery(&level_, &voltage_);

    primed_ = true;
  }

  FIFReadPolicy policy() const override {
    return FIFReadPolicy::PrimeOnce;
  }

  void toPayload(char* out, size_t outLen) override {
    snprintf(out, outLen, "battery: level=%.2f voltage=%.2f", level_, voltage_);
  }

  bool primed() const {
    return primed_;
  }

private:
  Tracker_Peripheral& tp_;
  bool primed_ = false;
  float level_ = 0.0f;
  float voltage_ = 0.0f;
};

// ------------------------------
// UML: FIFGPSData
// ------------------------------
class FIFGPSData : public FIFSensor {
public:
  explicit FIFGPSData(WM1110_Geolocation& geo) : geo_(geo) {}

  void read() override {
    // GNSS acquisition is handled by the tracker state machine in loop().
    // So this remains a no-op for the interface.
  }

  FIFReadPolicy policy() const override {
    return FIFReadPolicy::ExternalEvent;
  }

private:
  WM1110_Geolocation& geo_;
};

// ------------------------------
// UML: FIFDevBoard
// Board depends on FIFSensor abstraction only.
// ------------------------------
class FIFDevBoard {
public:
  FIFDevBoard(Tracker_Peripheral& tracker,
              WM1110_Geolocation& geo,
              FIFSensor** sensors,
              size_t sensorCount)
    : tracker_(tracker),
      geo_(geo),
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

    primeStaleSensorsOnce();

    geo_.run();
    status_ = "RUNNING";
  }

  void collectDataAndQueueUplink() {
    for (size_t i = 0; i < sensorCount_; ++i) {
      if (sensors_[i] == nullptr) continue;

      switch (sensors_[i]->policy()) {
        case FIFReadPolicy::EveryCycle:
          sensors_[i]->read();
          break;

        case FIFReadPolicy::PrimeOnce:
          // already handled by primeStaleSensorsOnce()
          break;

        case FIFReadPolicy::ExternalEvent:
          // GPS handled by tracker state machine
          break;
      }
    }

    if (!stalePrimed_) {
      primeStaleSensorsOnce();
    }

    tracker_.packUplinkSensorDatas();
    tracker_.getUplinkSensorDatas(sensorBuf_, &sensorSize_);
    geo_.insertIntoTxQueue(sensorBuf_, sensorSize_);

    lastUplinkTimeMs_ = smtc_modem_hal_get_time_in_ms();
  }

  WM1110_Geolocation& geo() {
    return geo_;
  }

  Tracker_Peripheral& tracker() {
    return tracker_;
  }

  const char* status() const {
    return status_;
  }

  uint32_t lastUplinkTimeMs() const {
    return lastUplinkTimeMs_;
  }

private:
  void primeStaleSensorsOnce() {
    if (stalePrimed_) return;

    // Prime stale environmental values once to preserve SenseCAP payload behavior.
    tracker_.measureSHT4xDatas(&temperature_, &humidity_);

    for (size_t i = 0; i < sensorCount_; ++i) {
      if (sensors_[i] == nullptr) continue;

      if (sensors_[i]->policy() == FIFReadPolicy::PrimeOnce) {
        sensors_[i]->read();
      }
    }

    stalePrimed_ = true;
  }

private:
  String deviceEUI_ = "";
  const char* status_ = "INIT";
  uint32_t lastUplinkTimeMs_ = 0;

  Tracker_Peripheral& tracker_;
  WM1110_Geolocation& geo_;

  FIFSensor** sensors_ = nullptr;
  size_t sensorCount_ = 0;

  bool stalePrimed_ = false;
  float temperature_ = 0.0f;
  float humidity_ = 0.0f;

  uint8_t sensorBuf_[64] = {0};
  uint8_t sensorSize_ = 0;
};

// ------------------------------
// Global shared stack objects
// ------------------------------
static Tracker_Peripheral tracker;
static WM1110_Geolocation& geo = WM1110_Geolocation::getInstance();

// ------------------------------
// Concrete sensor instances
// These implement FIFSensor, but FIFDevBoard only sees FIFSensor*
// ------------------------------
static FIFAccelerometer accel(tracker);
static FIFBatteryMonitoring batt(tracker);
static FIFGPSData gps(geo);

static FIFSensor* sensorList[] = {
  &accel,
  &batt,
  &gps
};

// ------------------------------
// Global board instance
// ------------------------------
static FIFDevBoard board(
  tracker,
  geo,
  sensorList,
  sizeof(sensorList) / sizeof(sensorList[0])
);

// Keep your existing flags/logic:
static constexpr uint32_t EXECUTION_PERIOD = 50;

uint32_t track_timeout     = 2 * 60 * 1000;
uint32_t consume_time      = 0;
uint32_t track_period_time = 0;

uint32_t start_sensor_read_time = 0;
uint32_t sensor_read_period     = 0;

bool button_press_flag   = false;
bool button_trig_track   = false;
bool button_trig_collect = false;

bool shock_flag         = false;
bool shock_trig_track   = false;
bool shock_trig_collect = false;

// ------------------------------
// Triggers preserved
// ------------------------------
void trigger_track_action() {
  board.tracker().getUserButtonIrqStatus(&button_press_flag);
  if (button_press_flag) {
    if (!button_trig_track && !button_trig_collect) {
      button_trig_track   = true;
      button_trig_collect = true;
      board.geo().setEventStateAll(TRACKER_STATE_BIT0_SOS);
      board.tracker().setSensorEventStatus(TRACKER_STATE_BIT0_SOS);
    }
    board.tracker().clearUserButtonFlag();
  }

  board.tracker().getLIS3DHTRIrqStatus(&shock_flag);
  if (shock_flag) {
    if (!shock_trig_track && !shock_trig_collect) {
      shock_trig_track   = true;
      shock_trig_collect = true;
      board.geo().setEventStateAll(TRACKER_STATE_BIT5_DEV_SHOCK);
      board.tracker().setSensorEventStatus(TRACKER_STATE_BIT5_DEV_SHOCK);
    }
    board.tracker().clearShockFlag();
  }
}

void setup() {
  board.begin();

  sensor_read_period = board.geo().getSensorMeasurementPeriod() * 60 * 1000;
  track_period_time  = board.geo().getTrackPeriod() * 60 * 1000;
  track_timeout      = board.geo().getTrackTimeout() * 1000;
}

void loop() {
  static uint32_t now_time        = 0;
  static uint32_t start_scan_time = 0;

  bool result = false;

  uint32_t sleepTime = board.geo().lbmxProcess();
  board.geo().modemLedActionProcess();

  if (board.geo().time_sync_flag == true) {
    trigger_track_action();

    // -------- GNSS state machine --------
    if (sleepTime > 300) {
      now_time = smtc_modem_hal_get_time_in_ms();
      switch (board.geo().tracker_scan_status) {
        case Track_None:
        case Track_Start:
          if ((now_time - start_scan_time > track_period_time) || (start_scan_time == 0) ||
              button_trig_track || shock_trig_track) {
            if (board.geo().startTrackerScan()) {
              start_scan_time = smtc_modem_hal_get_time_in_ms();
              consume_time    = start_scan_time - now_time;
            } else {
              consume_time = smtc_modem_hal_get_time_in_ms() - now_time;
            }
          }
          break;

        case Track_Scaning:
          if (smtc_modem_hal_get_time_in_ms() - start_scan_time > track_timeout) {
            board.geo().stopTrackerScan();
            result = board.geo().getTrackResults();
            if (result) board.geo().displayTrackRawDatas();
          }
          break;

        case Track_End:
          result = board.geo().getTrackResults();
          if (result) board.geo().displayTrackRawDatas();
          board.geo().stopTrackerScan();
          break;

        case Track_Stop:
          board.geo().insertTrackResultsIntoQueue();
          consume_time = smtc_modem_hal_get_time_in_ms() - now_time;
          board.geo().tracker_scan_status = Track_None;
          button_trig_track = false;
          shock_trig_track  = false;
          break;

        default:
          break;
      }
      sleepTime = sleepTime - consume_time;
    }

    // -------- Sensor uplink --------
    if (sleepTime > 500) {
      now_time = smtc_modem_hal_get_time_in_ms();
      if ((now_time - start_sensor_read_time > sensor_read_period) || (start_sensor_read_time == 0) ||
          button_trig_collect || shock_trig_collect) {

        board.collectDataAndQueueUplink();

        start_sensor_read_time = smtc_modem_hal_get_time_in_ms();
        consume_time = start_sensor_read_time - now_time;
        sleepTime = sleepTime - consume_time;

        button_trig_collect = false;
        shock_trig_collect  = false;
      }
    }
  }

  // BLE -> AT config preserved
  static uint8_t cmd_data_buf[244] = {0};
  static uint8_t cmd_data_size     = 0;

  if (wm1110_ble.getBleRecData(cmd_data_buf, &cmd_data_size)) {
    cmd_parse_type = 1;
    wm1110_at_config.parseCmd((char*)cmd_data_buf, cmd_data_size);
    memset(cmd_data_buf, 0, cmd_data_size);
    cmd_data_size  = 0;
    cmd_parse_type = 0;
  }

  if (wm1110_ble.getBleStatus() == BleRunState::StateDisconnect) {
    smtc_modem_hal_reset_mcu();
  }

  delay(min(sleepTime, EXECUTION_PERIOD));
}