export type PlaylistTimestamp = {
  timestamp: number;
  timescale: 1000000;
};
export const PlaylistTimestamp = {
  fromRTMP(timestamp: number): PlaylistTimestamp {
    return {
      timestamp: timestamp * 1000,
      timescale: 1000000,
    };
  },
};
