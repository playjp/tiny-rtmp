

const y_pos = (x: number, y: number, width: number, height: number): number => {
  return y * width + x;
};

const u_pos = (x: number, y: number, width: number, height: number): number => {
  return (height * width) + y * Math.floor(width / 2) + x;
};

const v_pos = (x: number, y: number, width: number, height: number): number => {
  return (height * width) + Math.floor(height * width / 4) + y * Math.floor(width / 2) + x;
};

export default (width: number, height: number): Buffer => {
  const yuv = Buffer.alloc(Math.floor(width * height * 3 / 2));

  const a = width;
  const d = Math.floor(a / 8);

  for (let y = 0; y < Math.floor(height / 2); y++) {
    for (let i = 0; i < Math.floor(d / 2); i++) {
      yuv[y_pos(i * 2 + 0, y * 2 + 0, width, height)] = 104;
      yuv[y_pos(i * 2 + 1, y * 2 + 0, width, height)] = 104;
      yuv[y_pos(i * 2 + 0, y * 2 + 1, width, height)] = 104;
      yuv[y_pos(i * 2 + 1, y * 2 + 1, width, height)] = 104;
      yuv[u_pos(i, y, width, height)] = 128;
      yuv[v_pos(i, y, width, height)] = 128;
    }
    for (let i = 0; i < Math.floor(d / 2); i++) {
      yuv[y_pos((width - 1) - (i * 2 + 0), y * 2 + 0, width, height)] = 104;
      yuv[y_pos((width - 1) - (i * 2 + 1), y * 2 + 0, width, height)] = 104;
      yuv[y_pos((width - 1) - (i * 2 + 0), y * 2 + 1, width, height)] = 104;
      yuv[y_pos((width - 1) - (i * 2 + 1), y * 2 + 1, width, height)] = 104;
      yuv[u_pos((width - 1) - (i * 1 + 0), y * 1 + 0, width, height)] = 128;
      yuv[v_pos((width - 1) - (i * 1 + 0), y * 1 + 0, width, height)] = 128;
    }
  }

  return yuv;
}
