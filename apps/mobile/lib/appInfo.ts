// App metadata shown in Settings. Read from app.json (bundled at build
// time) rather than expo-constants, which isn't a direct dependency.
import appJson from '../app.json';

export const APP_NAME: string = appJson.expo.name;
export const APP_VERSION: string = appJson.expo.version;

/** "SmartBudget 1.0.0" style label. */
export function appVersionLabel(name: string = APP_NAME, version: string = APP_VERSION): string {
  return version ? `${name} ${version}` : name;
}
