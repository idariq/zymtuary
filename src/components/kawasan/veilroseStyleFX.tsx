import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Corak 8x8 ordered (Bayer) dithering — dibina di JS sbg tekstur data 8x8
 * kecil (bukan array GLSL) supaya elak isu keserasian sintaks
 * `type[n](...)` (constructor array) yang tak disokong penuh dlm GLSL ES
 * 1.00 (WebGL1), yg mana ShaderMaterial guna secara lalai walau dlm konteks
 * WebGL2. Sampel tekstur (NearestFilter + RepeatWrapping) berfungsi sama
 * persis dgn array lookup tapi serasi merentasi versi GLSL.
 */
const BAYER_8X8_ORDER = [
	0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30,
	54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
	61, 29, 53, 21,
];

function createBayerTexture(): THREE.DataTexture {
	const data = new Uint8Array(BAYER_8X8_ORDER.map((v) => Math.round((v / 63) * 255)));
	const tex = new THREE.DataTexture(data, 8, 8, THREE.RedFormat, THREE.UnsignedByteType);
	tex.magFilter = THREE.NearestFilter;
	tex.minFilter = THREE.NearestFilter;
	tex.wrapS = THREE.RepeatWrapping;
	tex.wrapT = THREE.RepeatWrapping;
	tex.needsUpdate = true;
	return tex;
}

/**
 * Shader "dither" gaya diorama low-poly bertekstur pixel (rujukan gaya yg
 * diminta pengguna: batu/pokok low-poly dgn permukaan berbintik pixel,
 * bukan gradien 3D licin) — pencahayaan/bayang 3D SEBENAR (directional
 * light, shadow map) dikekalkan penuh; hanya WARNA akhir dikuantum +
 * di-dither ikut corak Bayer supaya gradien licin pecah jadi bintik kasar.
 * uPixelSize kecil sengaja (bukan pixelasi blok besar) — rujukan gaya
 * pengguna ada siluet/tepi masih licin (anti-alias biasa), cuma TEKSTUR
 * permukaan yg berbintik.
 */
const DITHER_SHADER = {
	uniforms: {
		tDiffuse: { value: null },
		uBayerTex: { value: null as THREE.DataTexture | null },
		uLevels: { value: 6.0 },
		uPixelSize: { value: 1.5 },
		uResolution: { value: new THREE.Vector2(1, 1) },
	},
	vertexShader: /* glsl */ `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,
	fragmentShader: /* glsl */ `
		uniform sampler2D tDiffuse;
		uniform sampler2D uBayerTex;
		uniform float uLevels;
		uniform float uPixelSize;
		uniform vec2 uResolution;
		varying vec2 vUv;

		void main() {
			// Snap sampel ke grid "pixel" kasar (uPixelSize piksel skrin sebenar) —
			// kecil sengaja supaya siluet objek kekal licin, cuma tekstur permukaan
			// yg terasa kasar/pixel.
			vec2 pixelGrid = uResolution / max(uPixelSize, 1.0);
			vec2 snappedUv = floor(vUv * pixelGrid) / pixelGrid;
			vec4 texel = texture2D(tDiffuse, snappedUv);

			float threshold = texture2D(uBayerTex, gl_FragCoord.xy / 8.0).r;

			vec3 c = texel.rgb * uLevels;
			vec3 fracPart = fract(c);
			vec3 quantized = (floor(c) + step(threshold, fracPart)) / uLevels;

			gl_FragColor = vec4(quantized, texel.a);
		}
	`,
};

/**
 * Susun-atur post-processing "pixel art + 3D smooth" — RenderPass (3D
 * penuh, lighting/shadow biasa) → ShaderPass dither (kuantum+bintik warna)
 * → OutputPass (tone-mapping/color-space akhir, WAJIB jadi laluan TERAKHIR
 * supaya output ke kanvas betul, ikut corak contoh rasmi three.js
 * postprocessing). Ambil alih render loop Canvas ini sepenuhnya (priority
 * 1 pada useFrame memberitahu R3F supaya jangan auto-render frame yg sama).
 */
export function VeilroseDitherFX() {
	const { gl, scene, camera, size } = useThree();

	const composer = useMemo(() => {
		const bayerTex = createBayerTexture();
		const c = new EffectComposer(gl);
		c.addPass(new RenderPass(scene, camera));
		const ditherPass = new ShaderPass(DITHER_SHADER);
		ditherPass.material.uniforms.uBayerTex.value = bayerTex;
		c.addPass(ditherPass);
		c.addPass(new OutputPass());
		return c;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gl, scene, camera]);

	useEffect(() => {
		composer.setSize(size.width, size.height);
		composer.setPixelRatio(gl.getPixelRatio());
		const ditherPass = composer.passes[1] as InstanceType<typeof ShaderPass>;
		(ditherPass.material.uniforms.uResolution.value as THREE.Vector2).set(
			size.width * gl.getPixelRatio(),
			size.height * gl.getPixelRatio(),
		);
	}, [composer, gl, size]);

	useEffect(() => {
		return () => {
			const ditherPass = composer.passes[1] as InstanceType<typeof ShaderPass>;
			(ditherPass.material.uniforms.uBayerTex.value as THREE.DataTexture | null)?.dispose();
			composer.dispose();
		};
	}, [composer]);

	useFrame(() => {
		composer.render();
	}, 1);

	return null;
}

/**
 * Aktifkan bayang lembut (soft shadow) merentasi SEMUA mesh dlm scene ini
 * secara automatik — bangunan/hiasan/landmark Veilrose Quarter ditulis
 * sbg puluhan primitif merentasi banyak fail (veilroseBuildings.tsx,
 * veilroseDecor.tsx, veilroseLandmarks.tsx, ZymAvatar.tsx dll), jadi
 * traverse scene sekali (bukan sunting castShadow/receiveShadow satu-satu
 * pd setiap <mesh>) jauh lebih selamat drpd terlepas mana-mana satu.
 * Bayang kontak lembut inilah komponen "3D smooth" gaya rujukan pengguna
 * (batu/pokok low-poly dgn bayang lembut di bawahnya) — dither di atas
 * TIDAK ubah pencahayaan, cuma warna akhir.
 */
export function VeilroseAutoShadows() {
	const { scene } = useThree();

	useEffect(() => {
		scene.traverse((obj) => {
			const mesh = obj as THREE.Mesh;
			if ((mesh as unknown as { isMesh?: boolean }).isMesh) {
				mesh.castShadow = true;
				mesh.receiveShadow = true;
			}
		});
	}, [scene]);

	return null;
}
