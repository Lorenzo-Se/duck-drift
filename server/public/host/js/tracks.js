export const TRACKS = [
  {
    id: 'silverstone',
    name: 'Silverstone',
    texture: 'assets/tracks/silverstone_texture.png',
    mask: 'assets/tracks/silverstone_mask.png',
  },
];

export function getTrackById(mapId) {
  return TRACKS.find((track) => track.id === mapId) ?? TRACKS[0];
}
