import request from 'supertest';
import { app } from '../index';

describe('Health Check Routes', () => {
  describe('GET /health', () => {
    it('should return 200 with ok status and version', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        version: '1.0.0',
      });
      expect(response.type).toBe('application/json');
    });
  });

  describe('GET /api/v1/health', () => {
    it('should return 200 with ok status and version', async () => {
      const response = await request(app).get('/api/v1/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        version: '1.0.0',
      });
      expect(response.type).toBe('application/json');
    });
  });

  describe('Error handling for undefined routes', () => {
    it('should return 404 for undefined routes', async () => {
      const response = await request(app).get('/undefined-route');

      expect(response.status).toBe(404);
    });
  });
});

describe('CORS', () => {
  it('allows requests with no Origin header (native mobile clients)', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
  });

  it('reflects an allowed dev origin in Access-Control-Allow-Origin', async () => {
    const response = await request(app).get('/health').set('Origin', 'http://localhost:8081');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8081');
  });

  it('does not allow an arbitrary origin', async () => {
    const response = await request(app).get('/health').set('Origin', 'https://evil.example.com');

    expect(response.headers['access-control-allow-origin']).not.toBe('https://evil.example.com');
  });
});
