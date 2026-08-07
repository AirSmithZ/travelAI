declare module '*.json' {
  const value: unknown;
  export default value;
}

declare module '@mock/mock_singapore.json' {
  import type { Itinerary } from './itinerary';
  const value: Itinerary;
  export default value;
}
