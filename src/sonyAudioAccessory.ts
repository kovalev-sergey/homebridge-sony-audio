/* eslint-disable max-len */
import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
} from 'homebridge';

import { SonyDevice, DEVICE_EVENTS } from './sonyDevice';
import { ExternalTerminal, TerminalTypeMeta } from './api';

import { SonyAudioHomebridgePlatform } from './platform';

const RECONNECT_TIMEOUT = 5000;

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class SonyAudioAccessory {
  private serviceTv: Service;
  private serviceTvSpeaker: Service;
  // private servicesInputs: Service[];

  private device: SonyDevice;
  private inputSourceIds: Map<string, number>;
  private inputSources: Map<number, ExternalTerminal>;

  private lastErrorMessage = '';

  constructor(
    private readonly platform: SonyAudioHomebridgePlatform,
    private readonly accessory: PlatformAccessory<SonyDevice>,
  ) {
    this.device = accessory.context;
    this.inputSourceIds = new Map<string, number>();
    this.inputSources = new Map<number, ExternalTerminal>();
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, this.device.manufacturer)
      .setCharacteristic(this.platform.Characteristic.Model, this.device.systemInfo.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.systemInfo.serial || this.device.UDN);
      
    const serviceTvName = this.device.systemInfo.name;
    this.serviceTv = this.accessory.getService(serviceTvName) ||
      this.accessory.addService(this.platform.Service.Television, serviceTvName);
    this.serviceTv
      .setCharacteristic(this.platform.Characteristic.ConfiguredName, this.device.systemInfo.name)
      .setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode,
        this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    // TODO: maybe need to test are the device for volume / mute support
    const serviceTvSpeakerName = this.device.systemInfo.name + ' Speaker';
    this.serviceTvSpeaker = this.accessory.getService(serviceTvSpeakerName) ||
      this.accessory.addService(this.platform.Service.TelevisionSpeaker, serviceTvSpeakerName);
    
    this.serviceTvSpeaker.setCharacteristic(this.platform.Characteristic.VolumeControlType,
      this.platform.Characteristic.VolumeControlType.ABSOLUTE);
        
    this.device.getInputs()
      .then(terminals => terminals && this.buildInputs(terminals));

    // subcribe to events from device
    this.device.on(DEVICE_EVENTS.VOLUME, volume => this.onChangeVolume(volume));
    this.device.on(DEVICE_EVENTS.MUTE, mute => this.onChangeMute(mute));
    this.device.on(DEVICE_EVENTS.POWER, power => this.onChangePower(power));
    this.device.on(DEVICE_EVENTS.SOURCE, source => this.onChangeSource(source));

    
    this.initAccessoryCharacteristics();

    
    // register callbacks
    this.serviceTvSpeaker.getCharacteristic(this.platform.Characteristic.VolumeSelector)
      .on('set', this.setVolume.bind(this));
    this.serviceTvSpeaker.getCharacteristic(this.platform.Characteristic.Mute)
      .on('set', this.setMute.bind(this));
    this.serviceTv.getCharacteristic(this.platform.Characteristic.Active)
      .on('set', this.setPower.bind(this));
    this.serviceTv.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .on('set', this.setSource.bind(this));
    this.serviceTv.getCharacteristic(this.platform.Characteristic.RemoteKey)
      .on('set', this.setRemoteKey.bind(this));

    this.serviceTv.addLinkedService(this.serviceTvSpeaker);

  }

  /**
   * Create inputs based on terminals supported of the device
   * @param terminals 
   */
  buildInputs(terminals: ExternalTerminal[]) {
    terminals.forEach((terminal, index) => {
      const inputSourceSubtype = this.getInputSubtype(terminal);
      const identifier = index;
      const serviceInputSource = this.accessory.getService(terminal.uri) ||
        this.accessory.addService(this.platform.Service.InputSource, terminal.uri, inputSourceSubtype);
      serviceInputSource.updateCharacteristic(this.platform.Characteristic.ConfiguredName, terminal.label ? terminal.label : terminal.title);
      serviceInputSource.updateCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED);
      // hide readonly terminals
      if (this.device.isReadonlyTerminal(terminal)) {
        serviceInputSource.updateCharacteristic(this.platform.Characteristic.CurrentVisibilityState, this.platform.Characteristic.CurrentVisibilityState.HIDDEN);
        serviceInputSource.updateCharacteristic(this.platform.Characteristic.TargetVisibilityState, this.platform.Characteristic.TargetVisibilityState.HIDDEN);
      } else {
        serviceInputSource.updateCharacteristic(this.platform.Characteristic.CurrentVisibilityState, this.platform.Characteristic.CurrentVisibilityState.SHOWN);
        serviceInputSource.updateCharacteristic(this.platform.Characteristic.TargetVisibilityState, this.platform.Characteristic.TargetVisibilityState.SHOWN);
      }
      serviceInputSource.updateCharacteristic(this.platform.Characteristic.Identifier, identifier);
      // Determine the input type by the `meta` tag
      let inputSourceType = this.platform.Characteristic.InputSourceType.OTHER;
      switch (terminal.meta) {
        case TerminalTypeMeta.AUDIOSYSTEM:
        case TerminalTypeMeta.AVAMP:
        case TerminalTypeMeta.BD_DVD:
        case TerminalTypeMeta.CAMCODER:
        case TerminalTypeMeta.COMPLEX:
        case TerminalTypeMeta.DISC:
        case TerminalTypeMeta.GAME:
        case TerminalTypeMeta.HDMI:
        case TerminalTypeMeta.HDMI_OUTPUT:
        case TerminalTypeMeta.HOMETHEATER:
        case TerminalTypeMeta.PLAYBACKDEVICE:
        case TerminalTypeMeta.RECORDINGDEVICE:
        case TerminalTypeMeta.TV:
        case TerminalTypeMeta.VIDEO:
          inputSourceType = this.platform.Characteristic.InputSourceType.HDMI;
          break;
        case TerminalTypeMeta.BTAUDIO:
        case TerminalTypeMeta.BTPHONE:
          inputSourceType = this.platform.Characteristic.InputSourceType.AIRPLAY;
          break;
        case TerminalTypeMeta.COMPOSITE:
        case TerminalTypeMeta.COAXIAL:
          inputSourceType = this.platform.Characteristic.InputSourceType.COMPOSITE_VIDEO;
          break;
        case TerminalTypeMeta.COMPONENT:
        case TerminalTypeMeta.COMPONENTD:
        case TerminalTypeMeta.COMPOSITE_COMPONENTD:
          inputSourceType = this.platform.Characteristic.InputSourceType.COMPONENT_VIDEO;
          break;
        case TerminalTypeMeta.DIGITALCAMERA:
          inputSourceType = this.platform.Characteristic.InputSourceType.DVI;
          break;
        case TerminalTypeMeta.SVIDEO:
          inputSourceType = this.platform.Characteristic.InputSourceType.S_VIDEO;
          break;
        case TerminalTypeMeta.TAPE:
        case TerminalTypeMeta.TUNER:
        case TerminalTypeMeta.TUNERDEVICE:
          inputSourceType = this.platform.Characteristic.InputSourceType.TUNER;
          break;
        case TerminalTypeMeta.USBDAC:
          inputSourceType = this.platform.Characteristic.InputSourceType.USB;
          break;
      }
      serviceInputSource.updateCharacteristic(this.platform.Characteristic.InputSourceType, inputSourceType);
      let inputDeviceType = this.platform.Characteristic.InputDeviceType.OTHER;
      switch (terminal.meta) {
        case TerminalTypeMeta.SAT_CATV:
        case TerminalTypeMeta.TV:
          inputDeviceType = this.platform.Characteristic.InputDeviceType.TV;
          break;
        case TerminalTypeMeta.CAMCODER:
        case TerminalTypeMeta.RECORDINGDEVICE:
          inputDeviceType = this.platform.Characteristic.InputDeviceType.RECORDING;
          break;
        case TerminalTypeMeta.TAPE:
        case TerminalTypeMeta.TUNER:
        case TerminalTypeMeta.TUNERDEVICE:
          inputDeviceType = this.platform.Characteristic.InputDeviceType.TUNER;
          break;
        case TerminalTypeMeta.BTAUDIO:
        case TerminalTypeMeta.DISC:
        case TerminalTypeMeta.PLAYBACKDEVICE:
        case TerminalTypeMeta.SACD_CD:
          inputDeviceType = this.platform.Characteristic.InputDeviceType.PLAYBACK;
          break;
        case TerminalTypeMeta.AUDIOSYSTEM:
        case TerminalTypeMeta.AVAMP:
        case TerminalTypeMeta.BD_DVD:
        case TerminalTypeMeta.HOMETHEATER:
          inputDeviceType = this.platform.Characteristic.InputDeviceType.AUDIO_SYSTEM;
          break;
      }
      serviceInputSource.updateCharacteristic(this.platform.Characteristic.InputDeviceType, inputDeviceType);

      // save Identifier of the source input for future use
      this.inputSourceIds.set(inputSourceSubtype, identifier);
      // save terminals
      this.inputSources.set(identifier, terminal);

      this.serviceTv.addLinkedService(serviceInputSource);
    });
  }

  /**
   * Init accessory characteristics and if got error, try repeat it after `RECONNECT_TIMEOUT` timout
   */
  initAccessoryCharacteristics() {
    Promise.resolve()
      .then(() => this.device.getPowerState()) // get Power Status
      .then(power => this.onChangePower(power))
      .then(() => this.device.getVolumeState()) // get Volume Status
      .then(volumeInfo => {
        // set volume props and volume
        if (volumeInfo?.volume !== -1) {
          // check absolute or relative
          if (volumeInfo?.maxVolume === -1 ) { // the device does not support setting the volume by an absolute value
            this.serviceTvSpeaker.setCharacteristic(this.platform.Characteristic.VolumeControlType,
              this.platform.Characteristic.VolumeControlType.RELATIVE);
          } else {
            this.serviceTvSpeaker.setCharacteristic(this.platform.Characteristic.VolumeControlType,
              this.platform.Characteristic.VolumeControlType.ABSOLUTE);
            // set volume props
            this.serviceTvSpeaker.getCharacteristic(this.platform.Characteristic.Volume)
              .setProps({
                minValue: volumeInfo?.minVolume,
                maxValue: volumeInfo?.maxVolume,
                minStep: volumeInfo?.step === 0 ? 1 : volumeInfo?.step,
              });
            if (volumeInfo?.volume) {
              this.onChangeVolume(volumeInfo.volume);
            }
          }
        }
        // set mute
        this.onChangeMute(volumeInfo?.mute === 'on');
      })
      .then(() => this.device.getActiveInput()) // get active source
      .then(terminal => terminal && this.onChangeSource(terminal.uri))
      .then(() => this.lastErrorMessage = '') // reset the error
      .catch(err => {
        // log an error if the same error has not been logged before
        if (this.lastErrorMessage !== err.message) {
          this.platform.log.error(this.getErrorMessage(err));
          this.lastErrorMessage = err.message;
        }
        // try init the characteristics again after a while
        setTimeout(() => {
          this.platform.log.debug(`Device ${this.device.systemInfo.name}: trying reinit the device...`);
          this.initAccessoryCharacteristics();
        }, RECONNECT_TIMEOUT);
      });
  }

  /**
   * Generate an id for the device input terminal
   * @param terminal device inut terminal
   */
  private getInputSubtype(terminal: ExternalTerminal) {
    const id = this.platform.api.hap.uuid.generate(terminal.uri);
    return id;
  }

  /**
   * Create error message for homebridge log
   * @param error 
   */
  private getErrorMessage(error: Error): string {
    const deviceName = this.device.systemInfo.name;
    if (deviceName) {
      return `Device ${deviceName}: ${error.message}`;
    }
    return `${error.message}`;
  }

  /**
   * Wrap the CharacteristicSetCallback callback for loggin the error
   * and run heartbeat if the device is not available
   * @param callback 
   */
  private callbackWrapper(callback: CharacteristicSetCallback, error?: Error | null, value?: CharacteristicValue) {
    if (error) {
      this.platform.log.error(this.getErrorMessage(error));
      // reinit the characteristics because we assume that the connection with the device is lost
      this.initAccessoryCharacteristics();
    }
    callback(error, value);
  }

  onChangeVolume(volume: number) {
    this.serviceTvSpeaker.updateCharacteristic(this.platform.Characteristic.Volume, volume);
    this.platform.log.debug('Set Characteristic Volume -> ', volume);
  }

  onChangeMute(mute: boolean) {
    this.serviceTvSpeaker.updateCharacteristic(this.platform.Characteristic.Mute, mute);
    this.platform.log.debug('Set Characteristic Mute -> ', mute);
  }

  onChangePower(power: boolean) {
    this.serviceTv.updateCharacteristic(this.platform.Characteristic.Active, power);
    this.serviceTvSpeaker.updateCharacteristic(this.platform.Characteristic.Active, power);
    this.platform.log.debug('Set Speaker Characteristic Active -> ', power);
  }

  onChangeSource(source: string) {
    const terminal = this.device.getTerminalBySource(source);
    if (terminal) {
      const inputSubtype = this.getInputSubtype(terminal);
      const inputSourceId = this.inputSourceIds.get(inputSubtype);
      if (inputSourceId) {
        this.serviceTv.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, inputSourceId);
        this.platform.log.debug('Set Characteristic ActiveIdentifier -> ', inputSourceId);
      }
    }
  }

  setVolume(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.debug('Set Characteristic VolumeSelector -> ', value);
    const volumeSelector = value === this.platform.Characteristic.VolumeSelector.INCREMENT ? 0 : 1;
    this.device.setVolume(volumeSelector)
      .then(() => this.callbackWrapper(callback))
      .catch(err => this.callbackWrapper(callback, err));
  }

  setMute(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.debug('Set Characteristic Mute -> ', value);
    const mute = !!value;
    this.device.setMute(mute)
      .then(() => this.callbackWrapper(callback))
      .catch(err => this.callbackWrapper(callback, err));
  }

  setPower(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.debug('Set Power Characteristic Active -> ', value);
    this.device.setPower(value === this.platform.Characteristic.Active.ACTIVE)
      .then(() => this.callbackWrapper(callback))
      .catch(err => this.callbackWrapper(callback, err));
  }

  setSource(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.debug('Set Characteristic ActiveIdentifier -> ', value);
    const terminal = this.inputSources.get(value as number);
    if (terminal) {
      this.device.setSource(terminal)
        .then(() => this.callbackWrapper(callback))
        .catch(err => this.callbackWrapper(callback, err));
    }
  }

  setRemoteKey(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.debug('Set Characteristic RemoteKey -> ', value);

    switch (value) {
      case Characteristic.RemoteKey.ARROW_UP:
        this.device.setRemoteKey('AAAAAgAAALAAAAB4AQ==')
        .then(() => this.callbackWrapper(callback))
        .catch(err => this.callbackWrapper(callback, err));
        break;
      case Characteristic.RemoteKey.ARROW_DOWN:
        this.device.setRemoteKey('AAAAAgAAALAAAAB5AQ==')
        .then(() => this.callbackWrapper(callback))
        .catch(err => this.callbackWrapper(callback, err));
        break;
      case Characteristic.RemoteKey.ARROW_RIGHT:
        this.device.setRemoteKey('AAAAAgAAALAAAAB7AQ==')
        .then(() => this.callbackWrapper(callback))
        .catch(err => this.callbackWrapper(callback, err));
        break;
      case Characteristic.RemoteKey.ARROW_LEFT:
        this.device.setRemoteKey('AAAAAgAAALAAAAB6AQ==')
        .then(() => this.callbackWrapper(callback))
        .catch(err => this.callbackWrapper(callback, err));
        break;
      case Characteristic.RemoteKey.SELECT:
        this.device.setRemoteKey('AAAAAgAAADAAAAAMAQ==')
        .then(() => this.callbackWrapper(callback))
        .catch(err => this.callbackWrapper(callback, err));
        break;
      case Characteristic.RemoteKey.BACK:
        this.device.setRemoteKey('AAAAAwAAARAAAAB9AQ==')
        .then(() => this.callbackWrapper(callback))
        .catch(err => this.callbackWrapper(callback, err));
        break;
      case Characteristic.RemoteKey.INFORMATION:
        this.device.setRemoteKey('AAAAAgAAADAAAABTAQ==')
        .then(() => this.callbackWrapper(callback))
        .catch(err => this.callbackWrapper(callback, err));
        break;
      case Characteristic.RemoteKey.PLAY_PAUSE:
        this.device.setPause()
        .then(() => this.callbackWrapper(callback))
        .catch(err => this.callbackWrapper(callback, err));
        break;
      default:
        this.callbackWrapper(callback);
        break;
    }

  }
}
