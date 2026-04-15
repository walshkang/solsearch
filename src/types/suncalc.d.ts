declare module 'suncalc' {
  export interface SunCalcPosition {
    altitude: number; // radians
    azimuth: number; // radians, SunCalc convention
  }

  export function getPosition(date: Date, lat: number, lng: number): SunCalcPosition;

  const SunCalc: {
    getPosition: typeof getPosition;
  };

  export default SunCalc;
}
