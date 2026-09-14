import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Aktifkan bayang lembut (soft shadow) merentasi SEMUA mesh dlm scene ini
 * secara automatik — bangunan/hiasan/landmark Veilrose Quarter ditulis
 * sbg puluhan primitif merentasi banyak fail (veilroseBuildings.tsx,
 * veilroseDecor.tsx, veilroseLandmarks.tsx, ZymAvatar.tsx dll), jadi
 * traverse scene sekali (bukan sunting castShadow/receiveShadow satu-satu
 * pd setiap <mesh>) jauh lebih selamat drpd terlepas mana-mana satu.
 *
 * Nota: kesan dither/pixel (VeilroseDitherFX) sebelum ini dibuang atas
 * permintaan pengguna (2026-09-14) — bayang lembut ni KEKAL sbb ia
 * komponen "3D smooth" yg berasingan drpd tekstur pixel, bukan sebahagian
 * kesan yg dibatalkan.
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
