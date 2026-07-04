import { expect, test } from "../src/fixtures";

test("preview smoke environment is configured @preview", ({
  inviteeBearer,
  ownerBearer,
  preview,
}) => {
  expect(preview.apiBaseUrl).toMatch(/^https:\/\//u);
  expect(preview.siteBaseUrl).toMatch(/^https:\/\//u);
  expect(preview.webBaseUrl).toMatch(/^https:\/\//u);
  expect(preview.expectedSha).toHaveLength(40);
  expect(preview.ownerUserId).toBeTruthy();
  expect(preview.inviteeUserId).toBeTruthy();
  expect(ownerBearer.length).toBeGreaterThan(40);
  expect(inviteeBearer.length).toBeGreaterThan(40);
});
