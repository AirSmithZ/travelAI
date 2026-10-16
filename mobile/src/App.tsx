import { useState } from 'react';
import { isPhoneClient } from './device';
import { DesktopApp } from './DesktopApp';
import { PhoneApp } from './PhoneApp';

export function App() {
  const [phone] = useState(isPhoneClient);
  return phone ? <PhoneApp /> : <DesktopApp />;
}
