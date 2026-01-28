#include <Arduino.h>
#include <LbmWm1110.hpp>
#include <Lbmx.hpp>

static constexpr smtc_modem_region_t REGION = SMTC_MODEM_REGION_US_915;
static constexpr uint8_t SUB_BAND = 2; // TTN US915 FSB2

static const uint8_t DEV_EUI[8]  = { 0x2C, 0xF7, 0xF1, 0xF0, 0x64, 0x90, 0x00, 0x2F };
static const uint8_t JOIN_EUI[8] = { 0xF9, 0x74, 0x4E, 0xB7, 0x27, 0x93, 0xCA, 0x11 };
static const uint8_t APP_KEY[16] = {
  0xEC, 0x8A, 0x7E, 0x93, 0x72, 0x45, 0x13, 0x89,
  0x39, 0x65, 0x3A, 0x58, 0xEB, 0x6E, 0xC9, 0x13
};

static LbmWm1110& lbmWm1110 = LbmWm1110::getInstance();

class H : public LbmxEventHandlers {
  void reset(const LbmxEvent&) override {
    printf("RESET\n");
    if (LbmxEngine::setRegion(REGION) != SMTC_MODEM_RC_OK) abort();
    if (smtc_modem_set_region_sub_band(0, SUB_BAND) != SMTC_MODEM_RC_OK) abort();
    if (LbmxEngine::setOTAA(DEV_EUI, JOIN_EUI, APP_KEY) != SMTC_MODEM_RC_OK) abort();
    printf("JOIN...\n");
    if (LbmxEngine::joinNetwork() != SMTC_MODEM_RC_OK) abort();
  }
  void joined(const LbmxEvent&) override { printf("JOINED\n"); }
  void joinFail(const LbmxEvent&) override { printf("JOIN FAIL\n"); }
};

static void ModemEventHandler() {
  static LbmxEvent e;
  static H h;
  while (e.fetch()) { h.invoke(e); }
}

void setup() {
  delay(1000);
  printf("START\n");
  lbmWm1110.begin();
  LbmxEngine::begin(lbmWm1110.getRadio(), ModemEventHandler);
}

void loop() {
  LbmxEngine::doWork();
  delay(50);
}
