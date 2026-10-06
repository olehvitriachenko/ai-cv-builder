import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CvDocument } from './cv-document';
import type { CvDraft } from '@/entities/cv/schemas';
describe('education preview semantics', () => {
  it.each([
    ['Present', true, false],
    [String(new Date().getFullYear() + 3), true, true],
    ['2015', false, false],
  ] as const)('renders education end %s', (endDate, studying, expected) => {
    const draft: CvDraft = { schemaVersion: 2, languages: [], certifications: [], portfolio: [], hobbies: [], customSections: [], contact: { fullName: null, email: null, phone: null, location: null, links: [] }, summary: null, experience: [], skillCategories: [], education: [{ id: 'edu', institution: 'University', qualification: 'Degree', startDate: '2024', endDate, details: null }] };
    const html = renderToStaticMarkup(createElement(CvDocument, { draft, targetRole: 'Engineer' }));
    expect(html.includes('Currently studying')).toBe(studying);
    expect(html.includes('(expected)')).toBe(expected);
  });
});


it.each([
  [String(new Date().getFullYear()), false, false],
  [String(new Date().getFullYear()), true, true],
  [String(new Date().getFullYear() + 1), true, true],
  [null, true, false],
] as const)('renders explicit education ongoing=%s for %s', (endDate, ongoing, expected) => {
  const draft: CvDraft = { schemaVersion: 2, languages: [], certifications: [], portfolio: [], hobbies: [], customSections: [], contact: { fullName: null, email: null, phone: null, location: null, links: [] }, summary: null, experience: [], skillCategories: [], education: [{ id: 'edu', institution: 'University', qualification: 'Degree', startDate: '2022', endDate, ongoing, details: null }] };
  const html = renderToStaticMarkup(createElement(CvDocument, { draft, targetRole: 'Engineer' }));
  expect(html.includes('Currently studying')).toBe(ongoing);
  expect(html.includes('(expected)')).toBe(expected);
});
