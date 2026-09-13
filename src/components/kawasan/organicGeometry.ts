import * as THREE from 'three';

/**
 * Noise nilai (value noise) 3D — port drpd `hash`/`noise` GLSL yg sedia ada
 * dlm `world/globeShader.ts` (formula sama, versi CPU/TypeScript) supaya
 * gaya "organik" konsisten merentasi projek, bukan formula rawak baharu.
 */
function hash3(x: number, y: number, z: number): number {
	let hx = x * 0.3183099 + 0.1;
	let hy = y * 0.3183099 + 0.1;
	let hz = z * 0.3183099 + 0.1;
	hx -= Math.floor(hx);
	hy -= Math.floor(hy);
	hz -= Math.floor(hz);
	hx *= 17.0;
	hy *= 17.0;
	hz *= 17.0;
	const n = hx * hy * hz * (hx + hy + hz);
	return n - Math.floor(n);
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function noise3(x: number, y: number, z: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);
	const fx = x - ix;
	const fy = y - iy;
	const fz = z - iz;
	const sx = fx * fx * (3 - 2 * fx);
	const sy = fy * fy * (3 - 2 * fy);
	const sz = fz * fz * (3 - 2 * fz);

	const n000 = hash3(ix, iy, iz);
	const n100 = hash3(ix + 1, iy, iz);
	const n010 = hash3(ix, iy + 1, iz);
	const n110 = hash3(ix + 1, iy + 1, iz);
	const n001 = hash3(ix, iy, iz + 1);
	const n101 = hash3(ix + 1, iy, iz + 1);
	const n011 = hash3(ix, iy + 1, iz + 1);
	const n111 = hash3(ix + 1, iy + 1, iz + 1);

	const nx00 = lerp(n000, n100, sx);
	const nx10 = lerp(n010, n110, sx);
	const nx01 = lerp(n001, n101, sx);
	const nx11 = lerp(n011, n111, sx);
	const nxy0 = lerp(nx00, nx10, sy);
	const nxy1 = lerp(nx01, nx11, sy);
	return lerp(nxy0, nxy1, sz);
}

/** fbm 3 oktaf — cukup butiran utk permukaan organik tanpa terlalu kos
 * (dipanggil sekali per verteks semasa BINA geometri, bukan per-frame). */
function fbm3(x: number, y: number, z: number): number {
	let v = 0;
	let amp = 0.5;
	let fx = x;
	let fy = y;
	let fz = z;
	for (let i = 0; i < 3; i++) {
		v += amp * noise3(fx, fy, fz);
		fx *= 2.05;
		fy *= 2.05;
		fz *= 2.05;
		amp *= 0.5;
	}
	return v;
}

/**
 * Bina "blob" organik — asas icosahedron (bulatan geodesik), TIAP verteks
 * diherot sepanjang arah normalnya ikut fbm noise (3D, dipetakan pd
 * kedudukan ARAH verteks itu sendiri, bukan koordinat dunia — supaya bentuk
 * konsisten tanpa kira kedudukan/putaran objek). Hasil: permukaan
 * berlekuk-lekuk semula jadi (batu/kanopi pokok) BUKAN platonic solid licin
 * (icosahedron/dodecahedron rata) — gaya rujukan "dunia sebenar" yg diminta
 * pengguna, bukan "bentuk blok". `flatShading` pd material (dah jadi
 * konvensyen sedia ada seluruh Veilrose Quarter) kekal berfungsi sbb three.js
 * kira normal rata via terbitan skrin (dFdx/dFdy), tak bergantung pd
 * bilangan segmen geometri.
 *
 * `seed` benarkan pelbagai instance (cth. 6 pokok, 10 gerai bunga) dapat
 * bentuk BERBEZA drpd formula SAMA — tanpanya semua blob nampak
 * identikal (klon disalin, bukan organik).
 */
export function createOrganicBlob({
	radius,
	detail = 1,
	amplitude = 0.22,
	frequency = 2.4,
	seed = 0,
	squashY = 1,
}: {
	radius: number;
	detail?: number;
	amplitude?: number;
	frequency?: number;
	seed?: number;
	squashY?: number;
}): THREE.BufferGeometry {
	const geometry = new THREE.IcosahedronGeometry(radius, detail);
	const position = geometry.attributes.position;
	const seedOffset = seed * 37.13 + 4.7;
	const dir = new THREE.Vector3();

	for (let i = 0; i < position.count; i++) {
		dir.fromBufferAttribute(position, i).normalize();
		const n =
			fbm3(
				dir.x * frequency + seedOffset,
				dir.y * frequency + seedOffset * 1.7,
				dir.z * frequency + seedOffset * 0.6,
			) - 0.5;
		const displaced = radius * (1 + n * amplitude);
		position.setXYZ(i, dir.x * displaced, dir.y * displaced * squashY, dir.z * displaced);
	}

	geometry.computeVertexNormals();
	return geometry;
}
