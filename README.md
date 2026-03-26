# aWhere

A comprehensive location-tracking system designed as a Senior Design project at Stevens Institute of Technology. aWhere combines hardware and software to help users locate lost or misplaced items through GPS tracking, WiFi positioning, and a user-friendly web interface.

## Project Overview

aWhere is an IoT-based tracking solution that consists of:
- **Hardware**: Custom Arduino-based tracking devices with GPS and WiFi capabilities
- **Firmware**: Embedded software for device communication and data transmission
- **Frontend**: Modern React web application for device management and location visualization
- **Backend**: Supabase-powered database and real-time data synchronization

## Features

- Real-time GPS tracking of devices
- Interactive map visualization using Leaflet
- Device management dashboard
- Battery monitoring and status alerts
- Multi-device support
- Responsive web interface
- Docker containerization for easy deployment

## Tech Stack

### Frontend
- **React 19** - Modern JavaScript library for building user interfaces
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool and development server
- **Leaflet** - Interactive maps
- **Supabase** - Backend-as-a-Service for real-time data

### Firmware
- **Arduino** - Microcontroller platform
- **GPS Module** - Location tracking
- **WiFi Module** - Wireless communication
- **NeoPixel LEDs** - Visual indicators

### Development Tools
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **Vitest** - Unit and integration testing
- **ESLint** - Code linting
- **TypeScript** - Type checking

## Project Structure

```
aWhere/
├── frontend/           # React/TypeScript web application
│   ├── src/
│   │   ├── components/ # Reusable UI components
│   │   ├── controllers/# Business logic controllers
│   │   ├── entities/   # Data models
│   │   ├── models/     # Application models
│   │   ├── services/   # API and external services
│   │   ├── views/      # Page components
│   │   └── assets/     # Static assets
│   ├── tests/          # Test suites
│   ├── Dockerfile      # Frontend containerization
│   └── package.json    # Dependencies and scripts
├── firmware/           # Arduino firmware
│   └── aWhereFirmwareWorkspace/
│       ├── Default_Firmware-test/
│       └── libraries/  # Arduino libraries
├── deploy/             # Deployment scripts
│   ├── docker-compose.yml
│   └── deploy-frontend.sh
├── documentation/      # Project documentation
│   ├── MVC/           # MVC pattern examples
│   └── screenshots/   # Project screenshots
├── diagrams/          # System diagrams and use cases
└── README.md          # This file
```

##  Team

- **Developers**: Senior Design Team
- **Institution**: Stevens Institute of Technology
- **Course**: SSW 423 - Senior Design