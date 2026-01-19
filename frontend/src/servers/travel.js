import { request, getApiBase } from './http';

export const travelApi = {
  createPlan: (payload, opts) =>
    request('/api/v1/travel/plans', { method: 'POST', body: payload, ...opts }),

  geocode: (address, location, opts) => {
    const params = new URLSearchParams();
    params.set('address', address);
    if (location) params.set('location', location);
    return request(`/api/v1/travel/geocode?${params.toString()}`, { method: 'GET', ...opts });
  },

  streamItinerary: async ({ planId, startDate, endDate, signal }) => {
    const resp = await fetch(
      `${getApiBase()}/api/v1/travel/plans/${planId}/generate-itinerary/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          travel_plan_id: planId,
          start_date: startDate,
          end_date: endDate,
        }),
        signal,
      },
    );

    if (!resp.ok || !resp.body) {
      const text = await resp.text();
      const err = new Error(`Stream failed: ${resp.status}`);
      err.status = resp.status;
      err.data = text;
      throw err;
    }

    return resp.body;
  },
};

