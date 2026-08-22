export const TRACKS = [
  {
    id: 'silverstone',
    name: 'Silverstone',
    texture: 'assets/tracks/silverstone_texture.png',
    mask: 'assets/tracks/silverstone_mask.png',
    checkpointRadius: 55,
    checkpoints: [
      { x: 121, y: 145 },
      { x: 316, y: 964 },
      { x: 985, y: 304 },
      { x: 1026, y: 748 },
      { x: 1526, y: 1500 },
      { x: 2008, y: 1078 },
      { x: 1038, y: 165 },
    ],
  },
];

export function getTrackById(mapId) {
  return TRACKS.find((track) => track.id === mapId) ?? TRACKS[0];
}
