/*
 * TTN_Uplink_US915_WioTracker1110_Fixed.ino
 * Wio Tracker 1110 (WM1110) + Semtech LoRa Basics Modem (LBM) + The Things Stack
 *
 * Fixes:
 *  - Configurable US915 sub-band (common join-fail cause)
 *  - Automatic join retry with backoff
 *  - Debug prints for EUIs/keys to validate against console
 */

#include <Arduino.h>
#include <LbmWm1110.hpp>
#include <Lbmx.hpp>

////////////////////////////////////////////////////////////////////////////////
// State machine

enum class StateType
{
    Startup,
    Joining,
    Joined,
};

static StateType state = StateType::Startup;

////////////////////////////////////////////////////////////////////////////////
// LoRaWAN CONFIG — US915

static constexpr smtc_modem_region_t REGION = SMTC_MODEM_REGION_US_915;

// US915 sub-band: try 1 first (common for many gateways), switch to 2 if needed.
static constexpr uint8_t SUB_BAND = 2;  // <-- CHANGE TO 2 if your gateway is on sub-band 2

// OTAA credentials (MUST match TTS console device exactly)
static const uint8_t DEV_EUI[8] = { 0x2C, 0xF7, 0xF1, 0xF0, 0x64, 0x90, 0x00, 0x2F };

// JoinEUI (aka AppEUI in older naming). Must match console.
// All zeros is valid if you registered the device with all zeros.
static const uint8_t JOIN_EUI[8] = { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };

// AppKey (16 bytes). Must match console exactly.
static const uint8_t APP_KEY[16] = {
    0x0A, 0x8E, 0x1A, 0x4F, 0x04, 0x88, 0x41, 0x87,
    0x63, 0x85, 0xD4, 0xCC, 0x3C, 0x77, 0xB1, 0xBC
};

////////////////////////////////////////////////////////////////////////////////
// Uplink configuration

static constexpr uint32_t FIRST_UPLINK_DELAY = 10;  // seconds after join
static constexpr uint32_t UPLINK_PERIOD      = 30;  // seconds
static constexpr uint8_t  UPLINK_FPORT       = 3;

static constexpr uint32_t EXECUTION_PERIOD   = 50;  // ms

////////////////////////////////////////////////////////////////////////////////
// Globals

static LbmWm1110& lbmWm1110 = LbmWm1110::getInstance();

// Join retry backoff (seconds)
static uint32_t joinBackoffSec = 5;
static constexpr uint32_t JOIN_BACKOFF_MAX = 120;

////////////////////////////////////////////////////////////////////////////////
// Helpers

static void printHex(const uint8_t* b, size_t n)
{
    for (size_t i = 0; i < n; i++)
    {
        if (b[i] < 0x10) printf("0");
        printf("%X", b[i]);
    }
}

static void printOtaaParams()
{
    printf("DevEUI  : "); printHex(DEV_EUI, 8);  printf("\n");
    printf("JoinEUI : "); printHex(JOIN_EUI, 8); printf("\n");
    printf("AppKey  : "); printHex(APP_KEY, 16); printf("\n");
    printf("Region  : US915\n");
    printf("SubBand : %u\n", SUB_BAND);
}

////////////////////////////////////////////////////////////////////////////////
// Event Handlers

class MyLbmxEventHandlers : public LbmxEventHandlers
{
protected:
    void reset(const LbmxEvent& event) override;
    void joined(const LbmxEvent& event) override;
    void joinFail(const LbmxEvent& event) override;
    void alarm(const LbmxEvent& event) override;

private:
    void startJoin();
};

void MyLbmxEventHandlers::startJoin()
{
    printf("Config + Join...\n");

    // Set region
    if (LbmxEngine::setRegion(REGION) != SMTC_MODEM_RC_OK) abort();

    // Set US915 sub-band (critical)
    if (smtc_modem_set_region_sub_band(0, SUB_BAND) != SMTC_MODEM_RC_OK) abort();

    // OTAA credentials
    if (LbmxEngine::setOTAA(DEV_EUI, JOIN_EUI, APP_KEY) != SMTC_MODEM_RC_OK) abort();

    // Start join
    if (LbmxEngine::joinNetwork() != SMTC_MODEM_RC_OK) abort();

    state = StateType::Joining;
}

void MyLbmxEventHandlers::reset(const LbmxEvent& event)
{
    printf("----- RESET -----\n");
    printOtaaParams();

    joinBackoffSec = 5;
    startJoin();
}

void MyLbmxEventHandlers::joined(const LbmxEvent& event)
{
    printf("----- JOINED -----\n");
    state = StateType::Joined;

    // Schedule first uplink
    if (LbmxEngine::startAlarm(FIRST_UPLINK_DELAY) != SMTC_MODEM_RC_OK) abort();
}

void MyLbmxEventHandlers::joinFail(const LbmxEvent& event)
{
    printf("----- JOIN FAILED -----\n");

    // Backoff retry (prevents hammering airtime and helps in marginal RF)
    printf("Retry join in %lu seconds...\n", (unsigned long)joinBackoffSec);

    if (LbmxEngine::startAlarm(joinBackoffSec) != SMTC_MODEM_RC_OK) abort();

    joinBackoffSec = min(joinBackoffSec * 2, JOIN_BACKOFF_MAX);
    state = StateType::Joining;
}

void MyLbmxEventHandlers::alarm(const LbmxEvent& event)
{
    if (state != StateType::Joined)
    {
        // Alarm used for join retry
        printf("----- JOIN RETRY -----\n");
        startJoin();
        return;
    }

    static uint32_t counter = 0;

    printf("Send uplink #%lu\n", (unsigned long)counter);

    if (LbmxEngine::requestUplink(
            UPLINK_FPORT,
            false,
            &counter,
            sizeof(counter)
        ) != SMTC_MODEM_RC_OK)
    {
        abort();
    }

    counter++;

    if (LbmxEngine::startAlarm(UPLINK_PERIOD) != SMTC_MODEM_RC_OK) abort();
}

////////////////////////////////////////////////////////////////////////////////
// Modem Event Dispatcher

static void ModemEventHandler()
{
    static LbmxEvent event;
    static MyLbmxEventHandlers handlers;

    while (event.fetch())
    {
        printf("----- %s -----\n", event.getEventString().c_str());
        handlers.invoke(event);
    }
}

////////////////////////////////////////////////////////////////////////////////
// Arduino setup / loop

void setup()
{
    delay(1000);
    printf("\n========== STARTUP ==========\n");

    lbmWm1110.begin();

    LbmxEngine::begin(
        lbmWm1110.getRadio(),
        ModemEventHandler
    );

    LbmxEngine::printVersions(lbmWm1110.getRadio());
}

void loop()
{
    // LED patterns
    switch (state)
    {
        case StateType::Startup:
            ledOff(LED_BUILTIN);
            break;

        case StateType::Joining:
            if (millis() % 1000 < 200) ledOn(LED_BUILTIN);
            else ledOff(LED_BUILTIN);
            break;

        case StateType::Joined:
            ledOn(LED_BUILTIN);
            break;
    }

    uint32_t sleepTime = LbmxEngine::doWork();
    delay(min(sleepTime, EXECUTION_PERIOD));
}
