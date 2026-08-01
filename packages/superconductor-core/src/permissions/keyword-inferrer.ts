import { CapabilityFlags } from './schemas';

export class KeywordPermissionInferrer {
  private static readonly KEYWORDS = {
    usb_access: ['lsusb', 'udevadm', '/dev/bus/usb', 'hardware access', 'usb device', 'hardware'],
    arbitrary_shell: ['arbitrary bash', 'arbitrary shell', 'arbitrary script', 'shell command'],
    network_unrestricted: ['external domain', 'curl arbitrary', 'network egress', 'random endpoint', 'external network'],
    fs_outside_root: ['/etc/', '~/', 'outside root', 'global config', 'home directory', 'outside the project']
  };

  public static inferCapabilities(text: string): CapabilityFlags {
    const lowerText = text.toLowerCase();
    
    const capabilities: CapabilityFlags = {
      usb_access: false,
      arbitrary_shell: false,
      network_unrestricted: false,
      fs_outside_root: false,
      persistent: false
    };

    for (const keyword of this.KEYWORDS.usb_access) {
      if (lowerText.includes(keyword)) capabilities.usb_access = true;
    }
    
    for (const keyword of this.KEYWORDS.arbitrary_shell) {
      if (lowerText.includes(keyword)) capabilities.arbitrary_shell = true;
    }

    for (const keyword of this.KEYWORDS.network_unrestricted) {
      if (lowerText.includes(keyword)) capabilities.network_unrestricted = true;
    }

    for (const keyword of this.KEYWORDS.fs_outside_root) {
      if (lowerText.includes(keyword)) capabilities.fs_outside_root = true;
    }

    return capabilities;
  }
}
