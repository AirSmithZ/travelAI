/**
 * DATA-03: 单一 Mock 源 = backend/app/data/mock_singapore.json
 */
import type { Itinerary } from '../types/itinerary';
import mockJson from '../../../backend/app/data/mock_singapore.json';

export const mockSingaporeItinerary = mockJson as unknown as Itinerary;
