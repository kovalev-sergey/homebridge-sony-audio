/* eslint-disable max-len */
import { SonyDevice } from './sonyDevice';
import { UnsupportedVersionApiError, GenericApiError, IncompatibleDeviceCategoryError } from './api';
import { Client as ssdp } from 'node-ssdp';
import { Logger } from 'homebridge';
import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import xmlParcer from 'fast-xml-parser';
import type { ValidationError } from 'fast-xml-parser';
import { URL } from 'url';
import EventEmitter from 'events';

/**
 * The search target for devices supporting Audio Control API
 */
const SSDP_SEARCH_TARGET = 'urn:schemas-sony-com:service:ScalarWebAPI:1';

export const enum DiscoveryEvents {
  NewDeviceFound = 'new-device-found'
}

type XmlParserError = ValidationError['err'];

/**
 * An instance of this class is periodically try to discover a new or
 * already found Sony audio devices and emit events about it
 */
export class Discoverer extends EventEmitter {
  private devices: Map<string, SonyDevice | null | string>;
  private ssdpClient;
  private axiosInstance: AxiosInstance;
  private poller?: NodeJS.Timeout;
  /**
   * Storage of the errors to prevent errors flooding
   */
  private errors: Map<string, string>;

  constructor (
    private readonly log: Logger,
  ) {
    super();
    this.devices = new Map<string, SonyDevice>();
    this.errors = new Map<string, string>();

    this.axiosInstance = axios.create();
    this.axiosInstance.interceptors.response.use(this.responseInterceptor);

    // init the SSDP client
    this.ssdpClient = new ssdp({
      // customLogger: log,
    });

    this.ssdpClient.on('response', (headers: Record<string, string>, code: number) => this.handleSsdpResponse(headers, code));
  }

  /**
   * The discovery process to find products connected to your network,
   * uses the Universal Plug and Play (UPnP) protocols and the Simple Service Discovery Protocol (SSDP).
   */
  public startDiscovery() {
    this.ssdpClient.search(SSDP_SEARCH_TARGET);
    this.poller = setInterval(() => {
      this.ssdpClient.search(SSDP_SEARCH_TARGET);
    }, 5000);
  }

  /**
   * Stop periodicaly discovering
   */
  public stopDiscovery() {
    if (this.poller) {
      clearInterval(this.poller);
    }
  }

  handleSsdpResponse(headers: Record<string, string>, code: number) {
    // this.log.debug('Got a response to an m-search:\n%s', JSON.stringify(headers, null, '  '));
    // Don't handle non 200 code
    if (code !== 200) {
      return;
    }
    const usn = headers?.USN;
    const location = headers?.LOCATION;
    if (!usn || !location) {
      return;
    }

    // According (https://developer.sony.com/develop/audio-control-api/hardware-overview/discovery-process)
    // The value of the ST header is identical to the one sent in the M-SEARCH request
    if (headers?.ST !== SSDP_SEARCH_TARGET) {
      // Found device is not supported by this plugin.
      // So, add it as a fake device to stop further processing
      this.devices.set(usn, null);
      return;
    }

    // If the discovered device is already registered, skip it
    if (this.devices.has(usn)) {
      return;
    }

    this.log.debug(`Start registering a new device from the description: ${location}`);
    this.registerDevice(usn, new URL(location));
  }

  registerDevice(usn: string, location: URL) {
    if (location.pathname === '/') {
      // Found device is not supported by this plugin.
      // So, add it as a fake device to stop further processing
      this.devices.set(usn, null);
      return;
    }

    // retrieve the device description
    axios.get(location.href)
      .then((response) => {
        this.errors.delete(location.href); // clear error if device responded
        let deviceDescription;
        try {
          deviceDescription = xmlParcer.parse(response.data);
        } catch (error) {
          this.log.debug(`ERROR: Can't parse the response from device during discovery. Error: ${(error as XmlParserError).code}, ${(error as XmlParserError).msg}`);
          return;
        }
        // Check for the presence of the `av:X_ScalarWebAPI_DeviceInfo` tag. If not, then this plugin does not support the device. Fix #7
        if (!deviceDescription?.root?.device?.['av:X_ScalarWebAPI_DeviceInfo']) {
          // Found device is not supported by this plugin.
          // So, add it as a fake device to stop further processing
          this.devices.set(usn, null);
          return;
        }

        // Set device status as Registration to prevent double registration
        if (this.devices.get(usn) === 'REGISTERING') {
          return;
        }
        this.devices.set(usn, 'REGISTERING');

        // Retrive IRCC service url
        const serviceList = deviceDescription.root.device.serviceList.service as Array<{serviceId: string; controlURL: string}>;
        let irccServiceUrl = '';
        let irccServiceExist = false;
        for (let i = 0; i < serviceList.length; i++) {
          const service = serviceList[i];
          if (service.serviceId === 'urn:schemas-sony-com:serviceId:IRCC') {
            irccServiceUrl = service.controlURL;
            irccServiceExist = true;
            break;
          }
        }
        const reAbsoluteUrl = new RegExp('^(?:[a-z]+:)?//', 'i');
        const upnpBaseUrl = irccServiceExist ? reAbsoluteUrl.test(irccServiceUrl) ? irccServiceUrl : location.protocol + '//' + location.hostname + ':' + location.port + irccServiceUrl : '';
        const deviceBaseUrl = deviceDescription.root.device['av:X_ScalarWebAPI_DeviceInfo']?.['av:X_ScalarWebAPI_BaseURL'];
        // const deviceServices = deviceDescription.root.device['av:X_ScalarWebAPI_DeviceInfo']?.['av:X_ScalarWebAPI_ServiceList']?.['av:X_ScalarWebAPI_ServiceType'];
        const deviceFriendlyName = deviceDescription.root.device.friendlyName;
        const deviceManufacturer = deviceDescription.root.device.manufacturer;
        const deviceModelName = deviceDescription.root.device.modelName;
        const deviceUDN = deviceDescription.root.device.UDN;
        if (!deviceBaseUrl || !deviceUDN) {
          this.log.error(`Error response from device during discovery. Url or UDN is not found: Url:${deviceBaseUrl}, UDN:${deviceUDN}`);
          // Found device is not supported by this plugin.
          // So, add it as a fake device to stop further processing
          this.devices.set(usn, null);
          return;
        }
        
        this.createDevice(deviceBaseUrl, upnpBaseUrl, deviceUDN, { friendlyName: deviceFriendlyName, manufacturer: deviceManufacturer, modelName: deviceModelName})
          .then(device => {
            this.devices.set(usn, device);
            // emit an event about new found device
            this.emit(DiscoveryEvents.NewDeviceFound, device);
            this.log.info('Compatible device found, added:', device.systemInfo.name);
          })
          .catch(() => {
            this.devices.set(usn, null);
            this.log.info('Incompatible device found, skipped:', deviceFriendlyName);
          });
      })
      .catch((err: AxiosError) => {
        // Fixed #1 to stop error log flooding when some devices illegally answer to discovering
        if (this.errors.get(location.href) !== err.message ) {
          this.log.debug(`ERROR: Can't retrieve the device description at ${location.href}: ${err}.\nIt looks like you have a problem in your network environment. All the same errors will be omitted.`);
          this.errors.set(location.href, err.message);
          this.devices.delete(usn);
        }
      });
  }

  createDevice(baseUrl: string, upnpBaseUrl: string, udn: string, opt: Record<string, string>) {
    return new Promise<SonyDevice>((resolve, reject) => {
    
      const deviceUrl = new URL(baseUrl);
      const upnpUrl = upnpBaseUrl !== '' ? new URL(upnpBaseUrl) : undefined;
      
      SonyDevice.createDevice(deviceUrl, upnpUrl, udn, this.log)
        .then((device) => {
          device.systemInfo.name = opt.friendlyName ? opt.friendlyName : '';
          device.manufacturer = opt.manufacturer ? opt.manufacturer : device.manufacturer;
          device.systemInfo.model = opt.modelName ? opt.modelName : '';
          resolve(device);
        })
        .catch(err => {
          if (err instanceof UnsupportedVersionApiError) {
            this.log.debug(err.message);
          } else if (err instanceof IncompatibleDeviceCategoryError) {
            this.log.debug(err.message);
          } else {
            this.log.error('message' in err ? err.message : err);
          }
          reject();
        });
    });
  }

  /**
   * Check the API response for returned error  
   * Decsription of errors [here](https://developer.sony.com/develop/audio-control-api/api-references/error-codes).
   * @param response
   */
  responseInterceptor(response: AxiosResponse) {
    if ('error' in response.data) {
      // TODO: add a device ip address for identification of the device
      const errMsg = `Device API got an error: ${JSON.stringify(response.data)}`;
      return Promise.reject(new GenericApiError(errMsg));
    } else {
      return response;
    }
  }
}
