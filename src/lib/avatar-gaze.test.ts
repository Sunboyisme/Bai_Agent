import { expect, test } from "vitest";
import { projectAvatarEyes, RESTING_EYE_TRANSFORMS } from "./avatar-gaze";

test("front view has equal upright eyes centred on the face, including vertical looks", () => {
  for (const pitch of [-1, 0, 1]) {
    const [left, right] = projectAvatarEyes(0, pitch);
    expect(left.a).toBeCloseTo(right.a, 12);
    expect(left.d).toBeCloseTo(right.d, 12);
    expect(Math.abs(left.c)).toBeCloseTo(Math.abs(right.c), 12);
    expect(left.y).toBeCloseTo(right.y, 12);
    expect((left.x + right.x) / 2).toBeCloseTo(44, 12);
  }
  const [left, right] = projectAvatarEyes(0, 0);
  expect(left).toEqual({ a: 1, b: 0, c: 0, d: 1, x: 36.5, y: 36 });
  expect(right).toEqual({ a: 1, b: 0, c: -0, d: 1, x: 51.5, y: 36 });
});

test("left and right turns reach opposite face halves with mirrored perspective", () => {
  const [leftFar, leftNear] = projectAvatarEyes(-1, 0);
  const [rightNear, rightFar] = projectAvatarEyes(1, 0);
  expect(leftNear.x).toBeLessThan(44);
  expect(rightNear.x).toBeGreaterThan(44);
  expect(leftNear.d).toBeGreaterThan(leftFar.d);
  expect(rightNear.d).toBeGreaterThan(rightFar.d);
  expect(leftNear.a).toBeGreaterThan(leftFar.a);
  expect(rightNear.a).toBeGreaterThan(rightFar.a);
  expect(leftNear.x + rightNear.x).toBeCloseTo(88, 12);
  expect(leftFar.x + rightFar.x).toBeCloseTo(88, 12);
});

test("all directions remain bounded, ordered and finite even beyond pointer range", () => {
  for (const horizontal of [-10, -1, -0.5, 0, 0.5, 1, 10]) {
    for (const vertical of [-10, -1, 0, 1, 10]) {
      const eyes = projectAvatarEyes(horizontal, vertical);
      expect(eyes[0].x).toBeLessThan(eyes[1].x);
      for (const eye of eyes) {
        expect(Object.values(eye).every(Number.isFinite)).toBe(true);
        expect(eye.x).toBeGreaterThan(20);
        expect(eye.x).toBeLessThan(68);
        expect(eye.y).toBeGreaterThan(20);
        expect(eye.y).toBeLessThan(55);
        expect(eye.a).toBeGreaterThan(0.65);
        expect(eye.d).toBeGreaterThan(0);
      }
    }
  }
});

test("reference resting gaze has equal upright eyes offset right and slightly down", () => {
  const eyes = RESTING_EYE_TRANSFORMS.map((value) =>
    value.slice(7, -1).split(",").map(Number),
  );
  const centerX = (eyes[0][4] + eyes[1][4]) / 2;
  const centerY = (eyes[0][5] + eyes[1][5]) / 2;
  expect(centerX).toBeGreaterThan(50);
  expect(centerX).toBeLessThan(54);
  expect(centerY).toBeGreaterThan(40);
  expect(centerY).toBeLessThan(43);
  expect(eyes[0][0]).toBe(eyes[1][0]);
  expect(eyes[0][3]).toBe(eyes[1][3]);
  expect(eyes[0][5]).toBe(eyes[1][5]);
  for (const eye of eyes) {
    expect(eye[0]).toBe(1);
    expect(eye[3]).toBe(1);
    expect(eye[1]).toBe(0);
    expect(eye[2]).toBe(0);
  }
});
