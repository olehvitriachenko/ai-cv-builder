import { containsFact, supportsQuantities } from './explicit-facts.js';
describe('explicit facts', () => {
  it.each(['2016', '2023', 'Jun 2024', 'Present'])('accepts supplied date %s', (date) => {
    expect(containsFact('2016–2023; Jun\n2024–Present', date)).toBe(true);
  });
  it.each(['1999', 'Jul 2024', '2030'])('rejects invented date %s', (date) => {
    expect(containsFact('2016–2023; Jun 2024–Present', date)).toBe(false);
  });
  it('preserves exact skill punctuation and word boundaries', () => {
    expect(containsFact('Node.js, C++, React Native', 'C++')).toBe(true);
    expect(containsFact('Node.js, C++, React Native', 'node.js')).toBe(true);
    expect(containsFact('JavaScript', 'Java')).toBe(false);
    expect(containsFact('Node.js', 'Kubernetes')).toBe(false);
  });
  it.each([
    ['Mentored four engineers; reduced latency 20%.', 'Coached 4 engineers; cut latency by 20 percent.'],
    ['Served 1,000 users.', 'Supported 1000 users.'],
    ['Team of twenty-one.', 'Worked with 21 colleagues.'],
    ['Built REST APIs.', 'Developed reliable APIs.'],
  ])('allows quantitative formatting and legitimate paraphrasing', (source, prose) => {
    expect(supportsQuantities(source, prose)).toBe(true);
  });
  it.each(['Led a team of 40.', 'Improved latency by 50%.', 'Mentored five engineers.', 'Saved 20%.'])('rejects invented quantity %s', (prose) => {
    expect(supportsQuantities('Mentored four engineers in 2020; served 20 users.', prose)).toBe(false);
  });
});
