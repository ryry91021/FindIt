#include <Arduino.h>
#include <TinyGPSPlus.h>

TinyGPSPlus gps;

// Try the Grove UART on Serial1 first.
// This matches the "no USB Serial" style of your working firmware.
static constexpr uint32_t GPS_BAUD = 9600;

volatile double g_lat = 0.0;
volatile double g_lon = 0.0;
volatile double g_alt = 0.0;
volatile uint32_t g_sats = 0;
volatile bool g_hasFix = false;
volatile uint32_t g_lastFixMs = 0;

void setup()
{
  // Do NOT use Serial.begin() here.
  // Your current board/core link is breaking on USB CDC Serial.

  Serial1.begin(GPS_BAUD);
  delay(500);
}

void loop()
{
  while (Serial1.available() > 0)
  {
    gps.encode(Serial1.read());
  }

  if (gps.location.isValid())
  {
    g_lat = gps.location.lat();
    g_lon = gps.location.lng();
    g_hasFix = true;
  }

  if (gps.altitude.isValid())
  {
    g_alt = gps.altitude.meters();
  }

  if (gps.satellites.isValid())
  {
    g_sats = gps.satellites.value();
  }

  if (gps.location.isUpdated())
  {
    g_lastFixMs = millis();
  }

  delay(10);
}