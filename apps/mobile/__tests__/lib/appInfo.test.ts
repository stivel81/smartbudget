import { APP_NAME, APP_VERSION, appVersionLabel } from '../../lib/appInfo';
import appJson from '../../app.json';

describe('lib/appInfo', () => {
  it('reads the version and name from app.json', () => {
    expect(APP_VERSION).toBe(appJson.expo.version);
    expect(APP_NAME).toBe(appJson.expo.name);
  });

  it('is a semver-looking version', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('labels name + version', () => {
    expect(appVersionLabel()).toBe(`${appJson.expo.name} ${appJson.expo.version}`);
    expect(appVersionLabel('X', '2.3.4')).toBe('X 2.3.4');
    expect(appVersionLabel('X', '')).toBe('X');
  });
});
