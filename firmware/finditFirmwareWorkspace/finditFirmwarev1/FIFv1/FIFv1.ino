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

// ============================================================
// Timing constants
// ============================================================

static constexpr uint32_t EXECUTION_PERIOD_MS       = 25;
static constexpr uint32_t ACTIVE_UPLINK_PERIOD_MS   = 15 * 1000;
static constexpr uint32_t TEST_UPLINK_PERIOD_MS     = 10 * 1000;
static constexpr uint32_t STATIONARY_TIMEOUT_MS     = 5 * 60 * 1000;
static constexpr uint32_t STATIONARY_HEARTBEAT_MS   = 15 * 60 * 1000;
static constexpr uint32_t GPS_DEBUG_PRINT_MS        = 3000;
static constexpr uint32_t SYNC_DEBUG_PRINT_MS       = 5000;
static constexpr uint32_t TEST_MODE_AUTO_TIMEOUT_MS = 30 * 60 * 1000;
static constexpr uint32_t LOW_POWER_IDLE_DELAY_MS   = 1000;
static constexpr uint32_t PRESS_WINDOW_MS           = 2500;
static constexpr uint32_t BUTTON_DEBOUNCE_MS        = 350;
// ============================================================
// Sensor base
// ============================================================

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

// ============================================================
// UART GPS
// ============================================================

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
    return FIFReadPolicy::ExternalEvent;
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

// ============================================================
// Accelerometer
// ============================================================

class FIFAccelerometer : public FIFSensor {
public:
  explicit FIFAccelerometer(Tracker_Peripheral& tp) : tp_(tp) {}

  void read() override {
    tp_.measureLIS3DHTRDatas(&x_, &y_, &z_);

    const float magnitudeSq = (x_ * x_) + (y_ * y_) + (z_ * z_);
    const float delta = fabsf(magnitudeSq - lastMagnitudeSq_);

    movedRecently_ = (delta > motionThresholdSqDelta_);
    lastMagnitudeSq_ = magnitudeSq;
  }

  FIFReadPolicy policy() const override {
    return FIFReadPolicy::EveryCycle;
  }

  bool movedRecently() const {
    return movedRecently_;
  }

private:
  Tracker_Peripheral& tp_;
  float x_ = 0.0f;
  float y_ = 0.0f;
  float z_ = 0.0f;
  float lastMagnitudeSq_ = 0.0f;
  bool movedRecently_ = true;

  static constexpr float motionThresholdSqDelta_ = 0.03f;
};

// ============================================================
// Battery placeholder
// ============================================================

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

// ============================================================
// Location providers
// ============================================================

struct TestPoint {
  double lat;
  double lon;
};

class ILocationProvider {
public:
  virtual ~ILocationProvider() = default;
  virtual bool getLocation(double& lat, double& lon) = 0;
};

class GpsLocationProvider : public ILocationProvider {
public:
  explicit GpsLocationProvider(FIFUARTGPS& gps) : gps_(gps) {}

  bool getLocation(double& lat, double& lon) override {
    if (!gps_.hasFix()) {
      return false;
    }

    lat = gps_.lat();
    lon = gps_.lon();
    return true;
  }

private:
  FIFUARTGPS& gps_;
};

class TestRouteProvider : public ILocationProvider {
public:
  bool getLocation(double& lat, double& lon) override {
    const TestPoint* route = nullptr;
    size_t routeLen = 0;

    switch (routeId_) {
      case 0:
        route = route0_;
        routeLen = sizeof(route0_) / sizeof(route0_[0]);
        break;

      case 1:
        route = route1_;
        routeLen = sizeof(route1_) / sizeof(route1_[0]);
        break;

      default:
        route = route0_;
        routeLen = sizeof(route0_) / sizeof(route0_[0]);
        break;
    }

    if (routeLen == 0) return false;

    const TestPoint& p = route[index_ % routeLen];
    lat = p.lat;
    lon = p.lon;
    index_++;

    return true;
  }

  void setRouteId(uint8_t routeId) {
    routeId_ = routeId;
    index_ = 0;
  }

  void resetIndex() {
    index_ = 0;
  }

  uint8_t routeId() const {
    return routeId_;
  }

private:
  uint8_t routeId_ = 0;
  size_t index_ = 0;

  static constexpr TestPoint route0_[] = {
    {40.744200, -74.025500},
    {40.744350, -74.025650},
    {40.744500, -74.025900},
    {40.744650, -74.026050}
  };

  static constexpr TestPoint route1_[] = {
    {40.740556, -74.032261},
    {40.740618, -74.032400},
    {40.740700, -74.032520},
    {40.740820, -74.032700}
  };
};

constexpr TestPoint TestRouteProvider::route0_[];
constexpr TestPoint TestRouteProvider::route1_[];

// ============================================================
// Runtime config / state
// ============================================================

enum class TrackerMode {
  NormalActive,
  StationaryLowPower,
  TestMode,
  Emergency
};

static const char* trackerModeToString(TrackerMode mode) {
  switch (mode) {
    case TrackerMode::NormalActive:
      return "normal_active";

    case TrackerMode::StationaryLowPower:
      return "stationary_low_power";

    case TrackerMode::TestMode:
      return "test_mode";

    case TrackerMode::Emergency:
      return "emergency";

    default:
      return "unknown";
  }
}

struct TrackerRuntimeConfig {
  bool testModeEnabled = false;
  uint8_t testRouteId = 0;

  uint32_t activeUplinkPeriodMs = ACTIVE_UPLINK_PERIOD_MS;
  uint32_t testUplinkPeriodMs = TEST_UPLINK_PERIOD_MS;
  uint32_t stationaryTimeoutMs = STATIONARY_TIMEOUT_MS;
  uint32_t stationaryHeartbeatMs = STATIONARY_HEARTBEAT_MS;
  uint32_t testModeAutoTimeoutMs = TEST_MODE_AUTO_TIMEOUT_MS;
};

struct TrackerRuntimeState {
  TrackerMode mode = TrackerMode::NormalActive;
  TrackerMode previousMode = TrackerMode::NormalActive;

  uint32_t lastUplinkMs = 0;
  uint32_t lastMotionMs = 0;
  uint32_t testModeStartedMs = 0;

  bool manualCollectRequested = false;
  bool shockTrigCollect = false;
  bool shockFlag = false;

  bool recordingEnabled = false;
  uint32_t recordingSessionId = 0;
};

// ============================================================
// Board wrapper
// ============================================================

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
      if (sensors_[i]) {
        sensors_[i]->begin();
      }
    }

    uartGps_.begin();

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

  bool collectAndQueueCustomLocationUplink(double lat, double lon, bool isTestMode) {
    uint8_t customPayload[8] = {0};

    const uint32_t lon_u = static_cast<uint32_t>(lround((lon + 180.0) * 1000000.0));
    const uint32_t lat_u = static_cast<uint32_t>(lround((lat + 90.0) * 1000000.0));

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
      return false;
    }

    tracker_.getUplinkCustomDatas(customBuf_, &customSize_);

    Serial.print("QUEUEING CUSTOM ");
    Serial.print(isTestMode ? "TEST" : "GPS");
    Serial.print(" UPLINK, bytes=");
    Serial.println(customSize_);

    Serial.print("Location raw lon=");
    Serial.print(lon, 6);
    Serial.print(" lat=");
    Serial.println(lat, 6);

    geo_.insertIntoTxQueue(customBuf_, customSize_);
    return true;
  }

  bool collectAndQueueRecordingMarker(bool recordingStarted,
                                      uint32_t sessionId,
                                      TrackerMode mode) {
    uint8_t recordPayload[24] = {0};

    const char* marker = recordingStarted ? "record:start" : "record:end";

    strncpy((char*)recordPayload, marker, 15);

    recordPayload[16] = (sessionId >> 24) & 0xFF;
    recordPayload[17] = (sessionId >> 16) & 0xFF;
    recordPayload[18] = (sessionId >> 8) & 0xFF;
    recordPayload[19] = sessionId & 0xFF;

    recordPayload[20] = static_cast<uint8_t>(mode);
    recordPayload[21] = recordingStarted ? 1 : 2;

    if (!tracker_.packUplinkCustomDatas(recordPayload, sizeof(recordPayload))) {
      Serial.println("packUplinkCustomDatas failed for recording marker");
      return false;
    }

    tracker_.getUplinkCustomDatas(customBuf_, &customSize_);

    Serial.print("QUEUEING RECORDING MARKER: ");
    Serial.print(marker);
    Serial.print(" session=");
    Serial.println(sessionId);

    Serial.print("Recording marker payload ASCII: ");
    Serial.println(marker);

    geo_.insertIntoTxQueue(customBuf_, customSize_);
    return true;
  }

  void queueStatusLog(TrackerMode mode, uint8_t routeId, bool testEnabled) {
    Serial.print("STATUS mode=");
    Serial.print(trackerModeToString(mode));
    Serial.print(" testEnabled=");
    Serial.print(testEnabled ? "true" : "false");
    Serial.print(" route=");
    Serial.println(routeId);
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

// ============================================================
// Controller
// ============================================================

class TrackerController {
public:
  TrackerController(FIFDevBoard& board,
                    FIFAccelerometer& accel,
                    ILocationProvider& gpsProvider,
                    TestRouteProvider& testProvider)
    : board_(board),
      accel_(accel),
      gpsProvider_(gpsProvider),
      testProvider_(testProvider) {}

  void begin() {
    state_.lastMotionMs = millis();
    state_.lastUplinkMs = 0;
    syncProvidersFromConfig();
  }

  void updateShockState() {
    board_.tracker().getLIS3DHTRIrqStatus(&state_.shockFlag);

    if (state_.shockFlag) {
      if (!state_.shockTrigCollect) {
        state_.shockTrigCollect = true;
        board_.tracker().setSensorEventStatus(TRACKER_STATE_BIT5_DEV_SHOCK);
      }

      board_.tracker().clearShockFlag();
    }

    if (accel_.movedRecently() || state_.shockTrigCollect) {
      state_.lastMotionMs = millis();
    }
  }

  void requestManualCollect() {
    state_.manualCollectRequested = true;
    board_.tracker().setSensorEventStatus(TRACKER_STATE_BIT0_SOS);
  }

  void toggleTestMode() {
    if (config_.testModeEnabled) {
      disableTestMode();
      Serial.println("TEST MODE DISABLED");
    } else {
      enableTestMode(config_.testRouteId);
      Serial.print("TEST MODE ENABLED, route=");
      Serial.println(config_.testRouteId);
    }

    board_.queueStatusLog(state_.mode, config_.testRouteId, config_.testModeEnabled);
  }

  void toggleRecordingMode() {
    if (!state_.recordingEnabled) {
      state_.recordingEnabled = true;
      state_.recordingSessionId = millis();

      Serial.print("RECORDING STARTED, session=");
      Serial.println(state_.recordingSessionId);

      board_.collectAndQueueRecordingMarker(
        true,
        state_.recordingSessionId,
        state_.mode
      );
    } else {
      Serial.print("RECORDING ENDED, session=");
      Serial.println(state_.recordingSessionId);

      board_.collectAndQueueRecordingMarker(
        false,
        state_.recordingSessionId,
        state_.mode
      );

      state_.recordingEnabled = false;
    }
  }

  bool isRecording() const {
    return state_.recordingEnabled;
  }

  bool isTestMode() const {
    return state_.mode == TrackerMode::TestMode;
  }

  bool isLowPowerMode() const {
    return state_.mode == TrackerMode::StationaryLowPower;
  }

  bool isActiveMode() const {
    return state_.mode == TrackerMode::NormalActive;
  }

  bool isEmergencyMode() const {
    return state_.mode == TrackerMode::Emergency;
  }

  void updateMode() {
    const uint32_t now = millis();
    state_.previousMode = state_.mode;

    if (config_.testModeEnabled) {
      state_.mode = TrackerMode::TestMode;

      if (state_.testModeStartedMs == 0) {
        state_.testModeStartedMs = now;
      }

      if ((now - state_.testModeStartedMs) > config_.testModeAutoTimeoutMs) {
        Serial.println("Test mode auto-timeout reached; disabling");
        disableTestMode();
        state_.mode = TrackerMode::NormalActive;
      }

      logModeChangeIfNeeded();
      return;
    }

    state_.testModeStartedMs = 0;

    if (state_.manualCollectRequested) {
      state_.mode = TrackerMode::Emergency;
      logModeChangeIfNeeded();
      return;
    }

    const bool stationaryTooLong =
      (now - state_.lastMotionMs) >= config_.stationaryTimeoutMs;

    state_.mode = stationaryTooLong
      ? TrackerMode::StationaryLowPower
      : TrackerMode::NormalActive;

    logModeChangeIfNeeded();
  }

  void runCycle(uint32_t nowMs) {
    switch (state_.mode) {
      case TrackerMode::NormalActive:
        runActiveCycle(nowMs);
        break;

      case TrackerMode::StationaryLowPower:
        runStationaryLowPowerCycle(nowMs);
        break;

      case TrackerMode::TestMode:
        runTestCycle(nowMs);
        break;

      case TrackerMode::Emergency:
        runEmergencyCycle(nowMs);
        break;
    }
  }

private:
  void enableTestMode(uint8_t routeId) {
    config_.testModeEnabled = true;
    config_.testRouteId = routeId;

    state_.testModeStartedMs = millis();

    testProvider_.setRouteId(routeId);
    testProvider_.resetIndex();
  }

  void disableTestMode() {
    config_.testModeEnabled = false;
    state_.testModeStartedMs = 0;

    testProvider_.resetIndex();
  }

  void syncProvidersFromConfig() {
    testProvider_.setRouteId(config_.testRouteId);
  }

  bool uplinkDue(uint32_t nowMs, uint32_t periodMs) const {
    return (state_.lastUplinkMs == 0) || ((nowMs - state_.lastUplinkMs) >= periodMs);
  }

  void finalizeCycle(uint32_t nowMs) {
    state_.lastUplinkMs = nowMs;
    state_.manualCollectRequested = false;
    state_.shockTrigCollect = false;
  }

  void logModeChangeIfNeeded() {
    if (state_.previousMode == state_.mode) return;

    Serial.print("MODE CHANGED TO ");
    Serial.println(trackerModeToString(state_.mode));
  }

  void runActiveCycle(uint32_t nowMs) {
    if (!uplinkDue(nowMs, config_.activeUplinkPeriodMs) &&
        !state_.manualCollectRequested &&
        !state_.shockTrigCollect) {
      return;
    }

    board_.collectAndQueueNativeSensorUplink();

    double lat = 0.0;
    double lon = 0.0;

    if (gpsProvider_.getLocation(lat, lon)) {
      board_.collectAndQueueCustomLocationUplink(lat, lon, false);
    } else {
      Serial.println("Skipping custom GPS uplink: no fix");
    }

    finalizeCycle(nowMs);
  }

  void runStationaryLowPowerCycle(uint32_t nowMs) {
    if (state_.shockTrigCollect) {
      Serial.println("Motion detected in low-power mode; returning to active tracking");
      state_.mode = TrackerMode::NormalActive;
      return;
    }

    if (!uplinkDue(nowMs, config_.stationaryHeartbeatMs)) {
      return;
    }

    Serial.println("LOW POWER HEARTBEAT");

    board_.collectAndQueueNativeSensorUplink();
    board_.queueStatusLog(state_.mode, config_.testRouteId, config_.testModeEnabled);

    finalizeCycle(nowMs);
  }

  void runTestCycle(uint32_t nowMs) {
    if (!uplinkDue(nowMs, config_.testUplinkPeriodMs) &&
        !state_.manualCollectRequested &&
        !state_.shockTrigCollect) {
      return;
    }

    board_.collectAndQueueNativeSensorUplink();

    double lat = 0.0;
    double lon = 0.0;

    if (testProvider_.getLocation(lat, lon)) {
      board_.collectAndQueueCustomLocationUplink(lat, lon, true);
    }

    finalizeCycle(nowMs);
  }

  void runEmergencyCycle(uint32_t nowMs) {
    Serial.println("EMERGENCY / SOS UPLINK");

    board_.collectAndQueueNativeSensorUplink();

    double lat = 0.0;
    double lon = 0.0;

    if (gpsProvider_.getLocation(lat, lon)) {
      board_.collectAndQueueCustomLocationUplink(lat, lon, false);
    } else {
      Serial.println("Emergency uplink sent without GPS fix");
    }

    finalizeCycle(nowMs);
    state_.mode = TrackerMode::NormalActive;
  }

private:
  FIFDevBoard& board_;
  FIFAccelerometer& accel_;
  ILocationProvider& gpsProvider_;
  TestRouteProvider& testProvider_;

  TrackerRuntimeConfig config_;
  TrackerRuntimeState state_;
};

// ============================================================
// Button manager
// ============================================================

class ButtonModeController {
public:
  explicit ButtonModeController(TrackerController& controller)
    : controller_(controller) {}

  void update(Tracker_Peripheral& tracker) {
    bool pressedEvent = false;
    tracker.getUserButtonIrqStatus(&pressedEvent);

    const uint32_t now = millis();

    if (pressedEvent) {
      tracker.clearUserButtonFlag();

      if ((now - lastAcceptedPressMs_) < BUTTON_DEBOUNCE_MS) {
        return;
      }

      lastAcceptedPressMs_ = now;

      pressCount_++;

      if (pressCount_ == 1) {
        firstPressMs_ = now;
      }

      Serial.print("BUTTON PRESS COUNT=");
      Serial.println(pressCount_);

      return;
    }

    if (pressCount_ > 0 && ((now - firstPressMs_) > PRESS_WINDOW_MS)) {
      if (pressCount_ == 1) {
        controller_.requestManualCollect();
        Serial.println("SINGLE PRESS: manual/SOS uplink requested");
      } 
      else if (pressCount_ == 2) {
        controller_.toggleTestMode();
        Serial.println("DOUBLE PRESS: toggled test mode");
      } 
      else if (pressCount_ >= 3) {
        controller_.toggleRecordingMode();
        Serial.println("TRIPLE PRESS: toggled recording mode");
      }

      pressCount_ = 0;
    }
  }

private:
  TrackerController& controller_;

  uint8_t pressCount_ = 0;
  uint32_t firstPressMs_ = 0;
  uint32_t lastAcceptedPressMs_ = 0;
};

// ============================================================
// Globals
// ============================================================

static Tracker_Peripheral tracker;
static WM1110_Geolocation& geo = WM1110_Geolocation::getInstance();

static FIFUARTGPS uartGps;
static FIFAccelerometer accel(tracker);
static FIFBatteryMonitoring batt(tracker);

static FIFSensor* sensorList[] = {
  &accel,
  &batt
};

static FIFDevBoard board(
  tracker,
  geo,
  uartGps,
  sensorList,
  sizeof(sensorList) / sizeof(sensorList[0])
);

static GpsLocationProvider gpsProvider(uartGps);
static TestRouteProvider testRouteProvider;

static TrackerController controller(
  board,
  accel,
  gpsProvider,
  testRouteProvider
);

static ButtonModeController buttonController(controller);

// ============================================================
// Setup / loop
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(300);

  board.begin();
  controller.begin();

  Serial.println("FindIt firmware starting");
  Serial.print("Active uplink period ms = ");
  Serial.println(ACTIVE_UPLINK_PERIOD_MS);
  Serial.print("Test uplink period ms = ");
  Serial.println(TEST_UPLINK_PERIOD_MS);
  Serial.print("Stationary timeout ms = ");
  Serial.println(STATIONARY_TIMEOUT_MS);
  Serial.print("Stationary heartbeat ms = ");
  Serial.println(STATIONARY_HEARTBEAT_MS);
  Serial.println("Single press = manual/SOS uplink");
  Serial.println("Double press = toggle test mode");
  Serial.println("Triple press = toggle recording mode");
}

void loop() {
  uint32_t sleepTime = board.geo().lbmxProcess();
  board.geo().modemLedActionProcess();

  if (controller.isActiveMode() || controller.isEmergencyMode()) {
    board.uartGps().read();
  }

  static uint32_t lastGpsPrint = 0;
  if (millis() - lastGpsPrint > GPS_DEBUG_PRINT_MS) {
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
  if (millis() - lastSyncPrint > SYNC_DEBUG_PRINT_MS) {
    lastSyncPrint = millis();

    Serial.print("time_sync_flag=");
    Serial.println(board.geo().time_sync_flag ? "true" : "false");
  }

  if (board.geo().time_sync_flag == true) {
    buttonController.update(board.tracker());

    if (!controller.isTestMode()) {
      accel.read();
      controller.updateShockState();
    }

    controller.updateMode();
    controller.runCycle(smtc_modem_hal_get_time_in_ms());
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

  uint32_t idleDelay = EXECUTION_PERIOD_MS;

  if (controller.isLowPowerMode()) {
    idleDelay = LOW_POWER_IDLE_DELAY_MS;
  }

  delay(min(sleepTime, idleDelay));
}