import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic, Categories } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SonyAudioAccessory } from './sonyAudioAccessory';
import { Discoverer, DiscoveryEvents } from './discoverer';
import { SonyDevice } from './sonyDevice';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class SonyAudioHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory<SonyDevice>[] = [];

  public readonly devices: SonyDevice[] = [];
  private discoverer: Discoverer;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.platform);
    this.discoverer = new Discoverer(this.log);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Started discovery process to find network connected Sony Audio products');
      this.discoverDevices();
    });

    this.api.on('shutdown', () => {
      this.discoverer.stopDiscovery();
      this.devices.forEach(device => {
        log.debug(`Device ${device.systemInfo.name} unsubscribing...`);
        device.unsubscribe();
      });
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory<SonyDevice>) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {

    // Start discovering Sony devices on the network
    this.discoverer.startDiscovery();

    this.discoverer.on(DiscoveryEvents.NewDeviceFound, device => this.publishDevice(device));
  }

  publishDevice(device: SonyDevice) {
    // generate a unique id for the accessory this should be generated from
    const uuid = this.api.hap.uuid.generate(device.UDN + (process.env.HOMEBRIDGE_SONY_AUDIO_DEV || ''));

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (device) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new SonyAudioAccessory(this, existingAccessory);
        
        // update accessory cache with any changes to the accessory details and information
        this.api.updatePlatformAccessories([existingAccessory]);
      } else if (!device) {
        // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
        // remove platform accessories when no longer present
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      }
    } else {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', device.systemInfo.name);

      // create a new Sony Audio accessory
      const accessory = new this.api.platformAccessory<SonyDevice>(device.systemInfo.name, uuid, Categories.AUDIO_RECEIVER);
      // store a copy of the device object in the `accessory.context`
      accessory.context = device;
      // create the accessory handler for the newly create accessory
      new SonyAudioAccessory(this, accessory);

      // publish external accessories (the accessory has a television service)
      this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
    }

    // save Sony Device for the next correct shutdown
    this.devices.push(device);
  }
}
