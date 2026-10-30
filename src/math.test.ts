import { describe, expect, test } from "bun:test";

import { Mat4, Vec4 } from "./math.ts";

function expectMatrix(actual: Float32Array, expected: number[]): void {
	for (let index = 0; index < expected.length; index++) {
		expect(actual[index]!).toBeCloseTo(expected[index]!, 6);
	}
}

describe("Mat4", () => {
	test("create returns the identity matrix", () => {
		expectMatrix(Mat4.create(), [
			1, 0, 0, 0,
			0, 1, 0, 0,
			0, 0, 1, 0,
			0, 0, 0, 1,
		]);
	});

	test("translation, scale, and rotation build the expected matrices", () => {
		expectMatrix(Mat4.translation(2, 3, 4), [
			1, 0, 0, 0,
			0, 1, 0, 0,
			0, 0, 1, 0,
			2, 3, 4, 1,
		]);

		expectMatrix(Mat4.scale(2, 3, 4), [
			2, 0, 0, 0,
			0, 3, 0, 0,
			0, 0, 4, 0,
			0, 0, 0, 1,
		]);

		expectMatrix(Mat4.rotation("z", Math.PI / 2), [
			0, 1, 0, 0,
			-1, 0, 0, 0,
			0, 0, 1, 0,
			0, 0, 0, 1,
		]);

		expectMatrix(Mat4.rotation("unknown", Math.PI), [
			1, 0, 0, 0,
			0, 1, 0, 0,
			0, 0, 1, 0,
			0, 0, 0, 1,
		]);
	});

	test("multiply composes matrices in column-vector order", () => {
		const result = Mat4.multiply(
			Mat4.create(),
			Mat4.translation(2, 3, 4),
			Mat4.scale(2, 3, 4),
		);

		expectMatrix(result, [
			2, 0, 0, 0,
			0, 3, 0, 0,
			0, 0, 4, 0,
			2, 3, 4, 1,
		]);
	});

	test("transpose works out of place and in place", () => {
		const source = Mat4.set(
			Mat4.create(),
			0, 1, 2, 3,
			4, 5, 6, 7,
			8, 9, 10, 11,
			12, 13, 14, 15,
		);
		const expected = [
			0, 4, 8, 12,
			1, 5, 9, 13,
			2, 6, 10, 14,
			3, 7, 11, 15,
		];

		expectMatrix(Mat4.transpose(Mat4.create(), source), expected);

		const in_place = new Float32Array(source);
		Mat4.transpose(in_place, in_place);
		expectMatrix(in_place, expected);
	});

	test("inverse reverses a translation", () => {
		const inverse = Mat4.inverse(
			Mat4.create(),
			Mat4.translation(2, 3, 4),
		);

		expectMatrix(inverse, [
			1, 0, 0, 0,
			0, 1, 0, 0,
			0, 0, 1, 0,
			-2, -3, -4, 1,
		]);
	});

	test("inverseTranspose3x3 inverts scale", () => {
		const normal = new Float32Array(9);

		Mat4.inverseTranspose3x3(normal, Mat4.scale(2, 4, 8));

		expectMatrix(normal, [
			0.5, 0, 0,
			0, 0.25, 0,
			0, 0, 0.125,
		]);
	});

	test("perspective and orthographic map their clip planes", () => {
		expectMatrix(
			Mat4.perspective(Mat4.create(), Math.PI / 2, 2, 1, 3),
			[
				0.5, 0, 0, 0,
				0, 1, 0, 0,
				0, 0, -2, -1,
				0, 0, -3, 0,
			],
		);

		expectMatrix(
			Mat4.orthographic(Mat4.create(), -2, 2, -1, 1, 1, 3),
			[
				0.5, 0, 0, 0,
				0, 1, 0, 0,
				0, 0, -1, 0,
				0, 0, -2, 1,
			],
		);
	});

	test("lookAt places the camera and looks down -Z", () => {
		expectMatrix(
			Mat4.lookAt(
				Mat4.create(),
				Vec4.from(0, 0, 5, 1),
				Vec4.from(0, 0, 0, 1),
				Vec4.from(0, 1, 0, 1),
			),
			[
				1, 0, 0, 0,
				0, 1, 0, 0,
				0, 0, 1, 0,
				0, 0, -5, 1,
			],
		);
	});
});

describe("Vec4", () => {
	test("create, set, and from build the expected vectors", () => {
		expect(Array.from(Vec4.create())).toEqual([0, 0, 0, 0]);

		const vector = Vec4.create();
		Vec4.set(vector, 1, 2, 3, 4);
		expect(Array.from(vector)).toEqual([1, 2, 3, 4]);
		expect(Array.from(Vec4.from(5, 6, 7, 8))).toEqual([5, 6, 7, 8]);
	});

	test("transformMat4 applies translation", () => {
		const result = Vec4.transformMat4(
			Vec4.create(),
			Vec4.from(1, 2, 3, 1),
			Mat4.translation(10, 20, 30),
		);

		expect(Array.from(result)).toEqual([11, 22, 33, 1]);
	});
});
