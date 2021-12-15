
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>


# Homebridge Sony Audio Plugin
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

This is a Homebridge platform plugin allow control the power, volume and input source on a supported Sony audio products.

## Features you can control with Sony Audio Plugin
* power – turn on and off
* volume – control sound levels including mute via iOS Remote
* input source – identify sound inputs
* control arrows, select, back and information buttons via iOS Remote
* control of input names and their visibility


For multi-zone environments plugin control current active output zone.

## Which Sony devices support the Audio Control API?
The following Sony audio products are accessible via the Homebridge Sony Audio Plugin.

[**Soundbars**](#soundbars)

<img src="docs/HT-CT800.webp">

[**Receivers**](#receivers)

<img src="docs/STR-DN1080.webp">

[**Speakers**](#speakers)

<p style="margin:auto;width:40%" >
<img src="docs/SRS-RA3000_Front_Black-Mid.webp">
</p>

### **Soundbars**

|Device|Description|More information|
|---|---|---|
|HT-A9|High Performance Home Theater System|<a href="https://electronics.sony.com/tv-video/tv-video-home-theater-sound-bars/soundbars/p/hta9">Product information|
|HT-A7000|7.1.2ch Dolby Atmos® Soundbar|<a href="https://electronics.sony.com/tv-video/tv-video-home-theater-sound-bars/soundbars/p/HT-A7000">Product information</a>|
|HT-A5000|5.1.2ch Dolby Atmos®/ DTS:X® Soundbar|<a href="https://www.sony.co.uk/electronics/sound-bars/ht-a5000">Product information</a>|
|HT-ST5000|7.1.2 channel Dolby Atmos/DTS:X soundbar with Wi-Fi/Bluetooth technology|<a href="https://www.sony.com/electronics/sound-bars/ht-st5000">Product information</a>|
|HT-MT500|2.1 channel compact soundbar with Wi-Fi/Bluetooth technology||
|HT-ZF9|3.1 channel Dolby Atmos/DTS:X soundbar with Wi-Fi/Bluetooth technology|<a href="https://www.sony.co.uk/electronics/sound-bars/ht-zf9">Product overview</a>|
|HT-Z9F|3.1 channel Dolby Atmos/DTS:X soundbar with Wi-Fi/Bluetooth technology|<a href="https://www.sony.com/electronics/sound-bars/ht-z9f">Product overview</a>|
|HT-CT800|2.1 channel soundbar with Wi-Fi/Bluetooth technology||
  

### **Receivers**
|Device|Description|More information|
|---|---|---|
|STR-DN1080|7.2 channel home theater AV receiver|<a href="https://www.sony.co.uk/electronics/av-receivers/str-dn1080">Product information</a>|

### **Speakers**
|Device|Description|More information|
|---|---|---|
|DeviceSRS-RA5000|Premium Wireless Speaker with Ambient Room-filling Sound|<a href="https://www.sony.co.uk/electronics/wireless-speakers/srs-ra5000" target="_blank">Product information</a>|
|SRS-RA3000|Premium Wireless Speaker with Ambient Room-filling Sound|<a href="https://www.sony.co.uk/electronics/wireless-speakers/srs-ra3000" target="_blank">Product information</a>|
|SRS-ZR5|Portable Wireless Bluetooth/Wi-Fi speaker"|

## Installation
If you are new to homebridge, please first read the homebridge [documentation](https://www.npmjs.com/package/homebridge).

### Install homebridge
```sh
npm install -g homebridge
```
### Install homebridge-sony-audio
```sh
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

## Setting up
Finded devices will be publishing externally, so you need paired it seperately:
1. In Home.app select "Add Accessory"
2. Click "I Don't Have a code or Cannot Scan"
3. On the next screen you find the discovered devices
4. Tap one and enter the pin code from your homebridge instance.

