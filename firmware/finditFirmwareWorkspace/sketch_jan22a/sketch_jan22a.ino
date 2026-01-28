/*
 * Default_Firmware.ino (modified per your request)
 *
 * Goal:
 *  - Uplink geolocation correctly (GNSS) using the stock SenseCAP/Seeed flow
 *  - Uplink accelerometer XYZ correctly (fresh each cycle)
 *  - Still uplink the “full sensor payload” format (so SenseCAP decoder stays happy),
 *    but keep the “unneeded sensors” effectively stale by NOT refreshing them after setup.
 *
 * Keeps:
 *  - LoRaWAN uplink/downlink processing (lbmxProcess)
 *  - BLE + AT config path
 *  - Button + shock triggers
 *  - Default payload packing (packUplinkSensorDatas / getUplinkSensorDatas)
 *
 * Fixes:
 *  - shock trigger typo (was checking shock_trig_track twice)
 *
 * Important:
 *  - This assumes Tracker_Peripheral’s packer uses cached/internal sensor values that are
 *    updated by the measure* calls. We do ONE initial read of “extra sensors” in setup
 *    (so they have valid values), and then we only refresh LIS3DHTR XYZ in loop.
 *  - Do NOT use any forceRejoin() calls (not in the public API).
 */

////////////////////////////////////////////////////////////////////////////////
// Includes

#include <Arduino.h>

#include <LbmWm1110.hpp>
#include <Lbmx.hpp>

#include <Lbm_Modem_Common.hpp>
#include <WM1110_Geolocation.hpp>
#include <WM1110_BLE.hpp>
#include <WM1110_Storage.hpp>
#include <WM1110_At_Config.hpp>
#include <Tracker_Peripheral.hpp>

// Set an execution period
static constexpr uint32_t EXECUTION_PERIOD = 50;  // [msec.]

// Instance
static WM1110_Geolocation& wm1110_geolocation = WM1110_Geolocation::getInstance();

// Track
uint32_t track_timeout     = 2 * 60 * 1000;
uint32_t consume_time      = 0;
uint32_t track_period_time = 0;

// Sensor measurement
uint32_t start_sensor_read_time = 0;
uint32_t sensor_read_period     = 0;

// Button interrupt
bool button_press_flag   = false;
bool button_trig_track   = false;
bool button_trig_collect = false;

// 3-axis interrupt
bool shock_flag         = false;
bool shock_trig_track   = false;
bool shock_trig_collect = false;

// Packed buf & size
uint8_t sensor_data_buf[64] = { 0 };
uint8_t sensor_data_size    = 0;

// Sensor data (we keep these for debug prints; packer may use internal state)
float x = 0.0f;
float y = 0.0f;
float z = 0.0f;

float temperature = 0.0f;
float humidity    = 0.0f;

// Receive cmd buf & size (BLE -> AT config)
uint8_t cmd_data_buf[244] = { 0 };
uint8_t cmd_data_size     = 0;

// Track whether we “primed” non-accelerometer sensors once (to keep them stale afterwards)
static bool extra_sensors_primed = false;

// Get button and vibration actions to trigger positioning
void trigger_track_action(void)
{
    // button action detect
    tracker_peripheral.getUserButtonIrqStatus(&button_press_flag);
    if (button_press_flag)
    {
        printf("Button press down\r\n");
        if ((button_trig_track == false) && (button_trig_collect == false))
        {
            button_trig_track   = true;
            button_trig_collect = true;
            wm1110_geolocation.setEventStateAll(TRACKER_STATE_BIT0_SOS);  // Set event state
            tracker_peripheral.setSensorEventStatus(TRACKER_STATE_BIT0_SOS);
        }
        tracker_peripheral.clearUserButtonFlag();
    }

    // Vibration action detect
    tracker_peripheral.getLIS3DHTRIrqStatus(&shock_flag);
    if (shock_flag)
    {
        printf("Shock trigger\r\n");

        // FIX: second condition should be shock_trig_collect
        if ((shock_trig_track == false) && (shock_trig_collect == false))
        {
            shock_trig_track   = true;
            shock_trig_collect = true;
            wm1110_geolocation.setEventStateAll(TRACKER_STATE_BIT5_DEV_SHOCK);  // Set event state
            tracker_peripheral.setSensorEventStatus(TRACKER_STATE_BIT5_DEV_SHOCK);
        }
        tracker_peripheral.clearShockFlag();
    }
}

////////////////////////////////////////////////////////////////////////////////
// setup and loop

void setup()
{
    // Initializes the storage area
    wm1110_storage.begin();
    wm1110_storage.loadBootConfigParameters();  // Load all parameters (WM1110_Param_Var.h)

    delay(1000);

    // Init BLE
    wm1110_ble.begin();
    wm1110_ble.setName();  // Set the Bluetooth broadcast name

    // Set broadcast parameters
    // true: central,  false: peripheral   empty: both
    wm1110_ble.setStartParameters();

    // Start broadcast
    wm1110_ble.startAdv();

    // Initializes detected IIC peripheral sensors (includes LIS3DHTR, SHT4x, etc.)
    tracker_peripheral.begin();
    tracker_peripheral.setUserButton();  // Set user button detection

    // Set the location mode to GNSS and uplink the data to SenseCAP platform
    wm1110_geolocation.begin(Track_Scan_Gps, true);

    // Initialize command parsing
    wm1110_at_config.begin();

    sensor_read_period = wm1110_geolocation.getSensorMeasurementPeriod();  // minutes
    sensor_read_period = sensor_read_period * 60 * 1000;                  // -> ms

    track_period_time = wm1110_geolocation.getTrackPeriod();  // minutes
    track_period_time = track_period_time * 60 * 1000;        // -> ms

    track_timeout = wm1110_geolocation.getTrackTimeout();  // seconds
    track_timeout = track_timeout * 1000;                  // -> ms

    // PRIME "extra" sensors ONCE so their values are valid but then become stale.
    // (We will NOT refresh them in loop.)
    tracker_peripheral.measureSHT4xDatas(&temperature, &humidity);
    extra_sensors_primed = true;

    printf("Primed extra sensors once: temp=%.2fC hum=%.2f%%\r\n", temperature, humidity);

    // Start running
    wm1110_geolocation.run();
}

void loop()
{
    static uint32_t now_time        = 0;
    static uint32_t start_scan_time = 0;

    bool result = false;

    // Run process
    // sleepTime is the desired sleep time for LoRaWAN's next task (Periodic positioning is not included)
    uint32_t sleepTime = wm1110_geolocation.lbmxProcess();

    // Light action for Join
    wm1110_geolocation.modemLedActionProcess();

    if (wm1110_geolocation.time_sync_flag == true)  // Device time synchronized from the LNS
    {
        trigger_track_action();

        // ----------------------------
        // TRACK (Geolocation) UPLINK
        // ----------------------------
        if (sleepTime > 300)  // Free time
        {
            now_time = smtc_modem_hal_get_time_in_ms();
            switch (wm1110_geolocation.tracker_scan_status)
            {
                case Track_None:
                case Track_Start:
                    if ((now_time - start_scan_time > track_period_time) || (start_scan_time == 0) ||
                        button_trig_track || shock_trig_track)
                    {
                        if (wm1110_geolocation.startTrackerScan())  // Start positioning
                        {
                            printf("Start tracker scan\r\n");
                            start_scan_time = smtc_modem_hal_get_time_in_ms();
                            consume_time    = start_scan_time - now_time;
                        }
                        else
                        {
                            consume_time = smtc_modem_hal_get_time_in_ms() - now_time;
                        }
                    }
                    break;

                case Track_Scaning:
                    if (smtc_modem_hal_get_time_in_ms() - start_scan_time > track_timeout)
                    {
                        wm1110_geolocation.stopTrackerScan();       // Timeout, stop positioning
                        result = wm1110_geolocation.getTrackResults();  // Get results
                        if (result)
                        {
                            wm1110_geolocation.displayTrackRawDatas();  // Display raw data
                        }
                    }
                    break;

                case Track_End:
                    result = wm1110_geolocation.getTrackResults();  // End of position, get results
                    if (result)
                    {
                        wm1110_geolocation.displayTrackRawDatas();
                    }
                    wm1110_geolocation.stopTrackerScan();  // Stop positioning
                    break;

                case Track_Stop:
                    printf("Stop tracker scan\r\n");
                    // Insert position data to LoRa TX buffer (THIS is the geolocation uplink)
                    wm1110_geolocation.insertTrackResultsIntoQueue();
                    consume_time = smtc_modem_hal_get_time_in_ms() - now_time;
                    wm1110_geolocation.tracker_scan_status = Track_None;
                    button_trig_track = false;
                    shock_trig_track  = false;
                    break;

                default:
                    break;
            }
            sleepTime = sleepTime - consume_time;
        }

        // ---------------------------------------
        // SENSOR PAYLOAD (Accel fresh + others stale)
        // ---------------------------------------
        if (sleepTime > 500)  // Free time
        {
            now_time = smtc_modem_hal_get_time_in_ms();
            if ((now_time - start_sensor_read_time > sensor_read_period) || (start_sensor_read_time == 0) ||
                button_trig_collect || shock_trig_collect)
            {
                printf("Reading sensor data (Accel fresh, others stale)...\r\n");

                // Fresh XYZ accelerometer each cycle
                tracker_peripheral.measureLIS3DHTRDatas(&x, &y, &z);

                // DO NOT refresh extra sensors here (SHT4x, etc.)
                // They remain whatever they were when last measured (primed once in setup).

                // If for any reason prime didn’t happen, do it once here.
                if (!extra_sensors_primed)
                {
                    tracker_peripheral.measureSHT4xDatas(&temperature, &humidity);
                    extra_sensors_primed = true;
                    printf("Late prime extra sensors: temp=%.2fC hum=%.2f%%\r\n", temperature, humidity);
                }

                // Pack data in the stock format (keeps SenseCAP decoder expectations)
                tracker_peripheral.packUplinkSensorDatas();

                // Display sensor raw data
                tracker_peripheral.displaySensorDatas();

                // Get packed data
                tracker_peripheral.getUplinkSensorDatas(sensor_data_buf, &sensor_data_size);

                // Insert packed sensor payload to LoRa TX buffer
                wm1110_geolocation.insertIntoTxQueue(sensor_data_buf, sensor_data_size);

                start_sensor_read_time = smtc_modem_hal_get_time_in_ms();
                consume_time           = start_sensor_read_time - now_time;
                sleepTime              = sleepTime - consume_time;

                button_trig_collect = false;
                shock_trig_collect  = false;
            }
        }
    }

    // BLE -> AT config commands from app
    if (wm1110_ble.getBleRecData(cmd_data_buf, &cmd_data_size))
    {
        cmd_parse_type = 1;
        wm1110_at_config.parseCmd((char*) cmd_data_buf, cmd_data_size);
        memset(cmd_data_buf, 0, cmd_data_size);
        cmd_data_size  = 0;
        cmd_parse_type = 0;
    }

    // The Bluetooth connection is disconnected. Restart to make the configuration take effect
    if (wm1110_ble.getBleStatus() == BleRunState::StateDisconnect)
    {
        smtc_modem_hal_reset_mcu();
    }

    delay(min(sleepTime, EXECUTION_PERIOD));
}
