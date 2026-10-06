import { educationStatus } from './education-status.js';
describe('education status', () => {
  const today = new Date(2026, 5, 1);
  it.each(['2029', 'Jul 2026', '2026-07', '07/2026', 'липень 2026'])('marks %s as expected and ongoing', (value) => {
    expect(educationStatus(value, today)).toEqual({ studying: true, expected: true });
  });
  it.each(['2025', 'Jun 2026', null, 'invalid'])('does not label completed/unknown date %s as ongoing', (value) => {
    expect(educationStatus(value, today)).toEqual({ studying: false, expected: false });
  });
  it('retains Present without an invented expected year', () => {
    expect(educationStatus('Present', today)).toEqual({ studying: true, expected: false });
  });
});
