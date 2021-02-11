
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>


# Homebridge Sony Audio Plugin

This is a Homebridge platform plugin allow control the power, volume and input source on a supported Sony audio products.

## Features you can control with Sony Audio Plugin
* power – turn on and off
* volume – control sound levels including mute via iOS Remote
* input source – identify sound inputs


For multi-zone environments plugin control current active output zone.

## Which Sony devices support the Audio Control API?
The following Sony audio products are accessible via the Homebridge Sony Audio Plugin.

### STR-DN1080
<img src="docs/STR-DN1080.webp">

> 7.2 channel home theater AV receiver

### HT-ST5000
<img src="docs/HT-ST5000.webp">

> 7.1.2 channel Dolby Atmos/DTS:X soundbar with Wi-Fi/Bluetooth technology

### HT-MT500
<img src="docs/MT-HT500.webp">

> 2.1 channel compact soundbar with Wi-Fi/Bluetooth technology

### HT-Z9F/HT-ZF9
<img src="docs/HT-Z9F_1.webp">

> 3.1 channel Dolby Atmos/DTS:X soundbar with Wi-Fi/Bluetooth technology

### HT-CT800
<img src="docs/HT-CT800.webp">

> 2.1 channel soundbar with Wi-Fi/Bluetooth technology

### SRS-ZR5
<img src="docs/SRZ.webp">

> Portable Wireless Bluetooth/Wi-Fi speaker

## Installation
If you are new to homebridge, please first read the homebridge [documentation](https://www.npmjs.com/package/homebridge).

### Install homebridge
```
npm install -g homebridge
```
### Install homebridge-sony-audio
```
npm install -g homebridge-sony-audio
```

## Configuration

No special configuration is required.\
Just add the `SonyAudio` platform to the platforms section:
```json
"platforms": [
  {
    "platform": "SonyAudio"
  }
]
```
## Adding devices

Devices are added automatically through the discovery process.

The discovery process to find products connected to your network, uses the Universal Plug and Play (UPnP) protocols and the Simple Service Discovery Protocol (SSDP). The audio product must be connected to the network and powered on, for the the discovery process to work.

For instructions, see the user manual for your product.
