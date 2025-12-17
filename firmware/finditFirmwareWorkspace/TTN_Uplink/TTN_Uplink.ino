/*
 * TTN_Uplink_US915_FSB2.ino
 * Pure TTN + Arduino for Wio Tracker 1110
 * Uses Semtech LoRa Basics Modem (LBM)
 */

////////////////////////////////////////////////////////////////////////////////
// Includes

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
    Failed,
};

////////////////////////////////////////////////////////////////////////////////
// LoRaWAN CONFIG — TTN US915 (CRITICAL)

static constexpr smtc_modem_region_t REGION = SMTC_MODEM_REGION_US_915;


static const uint8_t DEV_EUI[8] = {
    0x2C, 0xF7, 0xF1, 0xF0, 0x64, 0x90, 0x00, 0x2F
};

// JoinEUI / AppEUI (FROM TTN — all zeros is valid)
static const uint8_t JOIN_EUI[8] = {
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00
};

// AppKey (FROM TTN — GENERATED)
static const uint8_t APP_KEY[16] = {
    0x10, 0xE9, 0x5F, 0xB3, 0x3C, 0x74, 0xA2, 0xD3, 0xC7, 0x70, 0x45, 0x8B, 0x53, 0xC2, 0xF4, 0x10
};



////////////////////////////////////////////////////////////////////////////////
// Uplink configuration

static constexpr uint32_t FIRST_UPLINK_DELAY = 60;  // seconds
static constexpr uint32_t UPLINK_PERIOD      = 30;  // seconds
static constexpr uint8_t  UPLINK_FPORT       = 3;

static constexpr uint32_t EXECUTION_PERIOD   = 50;  // ms

////////////////////////////////////////////////////////////////////////////////
// Globals

static LbmWm1110& lbmWm1110 = LbmWm1110::getInstance();
static StateType state = StateType::Startup;

////////////////////////////////////////////////////////////////////////////////
// Event Handlers

class MyLbmxEventHandlers : public LbmxEventHandlers
{
protected:
    void reset(const LbmxEvent& event) override;
    void joined(const LbmxEvent& event) override;
    void joinFail(const LbmxEvent& event) override;
    void alarm(const LbmxEvent& event) override;
};

void MyLbmxEventHandlers::reset(const LbmxEvent& event)
{
    printf("----- RESET -----\n");

    // Set region
    if (LbmxEngine::setRegion(SMTC_MODEM_REGION_US_915) != SMTC_MODEM_RC_OK) abort();

    // TTN requires US915 sub-band 2
    if (smtc_modem_set_region_sub_band(0, 2) != SMTC_MODEM_RC_OK) abort();

    // OTAA credentials (from TTN)
    if (LbmxEngine::setOTAA(DEV_EUI, JOIN_EUI, APP_KEY) != SMTC_MODEM_RC_OK) abort();

    printf("Join the LoRaWAN network...\n");

    if (LbmxEngine::joinNetwork() != SMTC_MODEM_RC_OK) abort();

    state = StateType::Joining;
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
    state = StateType::Failed;
}

void MyLbmxEventHandlers::alarm(const LbmxEvent& event)
{
    static uint32_t counter = 0;

    printf("Send uplink #%lu\n", counter);

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

        case StateType::Failed:
            if (millis() % 400 < 200) ledOn(LED_BUILTIN);
            else ledOff(LED_BUILTIN);
            break;
    }

    uint32_t sleepTime = LbmxEngine::doWork();
    delay(min(sleepTime, EXECUTION_PERIOD));
}
