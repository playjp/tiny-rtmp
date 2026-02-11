

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
    // 40% Gray
    for (let i = 0; i < Math.floor(d / 2); i++) {
      yuv[y_pos(i * 2 + 0, y * 2 + 0, width, height)] = 104;
      yuv[y_pos(i * 2 + 1, y * 2 + 0, width, height)] = 104;
      yuv[y_pos(i * 2 + 0, y * 2 + 1, width, height)] = 104;
      yuv[y_pos(i * 2 + 1, y * 2 + 1, width, height)] = 104;
      yuv[u_pos(i * 1 + 0, y * 1 + 0, width, height)] = 128;
      yuv[v_pos(i * 1 + 0, y * 1 + 0, width, height)] = 128;

      yuv[y_pos((width - 1) - (i * 2 + 0), y * 2 + 0, width, height)] = 104;
      yuv[y_pos((width - 1) - (i * 2 + 1), y * 2 + 0, width, height)] = 104;
      yuv[y_pos((width - 1) - (i * 2 + 0), y * 2 + 1, width, height)] = 104;
      yuv[y_pos((width - 1) - (i * 2 + 1), y * 2 + 1, width, height)] = 104;
      yuv[u_pos((Math.floor(width / 2) - 1) - i, y * 1 + 0, width, height)] = 128;
      yuv[v_pos((Math.floor(width / 2) - 1) - i, y * 1 + 0, width, height)] = 128;
    }
    //
    for (let i = Math.floor(d / 2); i < (Math.floor(width / 2)) - Math.floor(d / 2); i++) {
      switch (Math.floor((i - Math.floor(d / 2)) * 14 / ((a - 2 * d)))) {
        case 0: // 75% White
          yuv[y_pos(i * 2 + 0, y * 2 + 0, width, height)] = 180;
          yuv[y_pos(i * 2 + 1, y * 2 + 0, width, height)] = 180;
          yuv[y_pos(i * 2 + 0, y * 2 + 1, width, height)] = 180;
          yuv[y_pos(i * 2 + 1, y * 2 + 1, width, height)] = 180;
          yuv[u_pos(i * 1 + 0, y * 1 + 0, width, height)] = 128;
          yuv[v_pos(i * 1 + 0, y * 1 + 0, width, height)] = 128;
          break;
        case 1: // Yellow
          yuv[y_pos(i * 2 + 0, y * 2 + 0, width, height)] = 168;
          yuv[y_pos(i * 2 + 1, y * 2 + 0, width, height)] = 168;
          yuv[y_pos(i * 2 + 0, y * 2 + 1, width, height)] = 168;
          yuv[y_pos(i * 2 + 1, y * 2 + 1, width, height)] = 168;
          yuv[u_pos(i * 1 + 0, y * 1 + 0, width, height)] = 44;
          yuv[v_pos(i * 1 + 0, y * 1 + 0, width, height)] = 136;
          break;
        case 2: // Cyan
          yuv[y_pos(i * 2 + 0, y * 2 + 0, width, height)] = 145;
          yuv[y_pos(i * 2 + 1, y * 2 + 0, width, height)] = 145;
          yuv[y_pos(i * 2 + 0, y * 2 + 1, width, height)] = 145;
          yuv[y_pos(i * 2 + 1, y * 2 + 1, width, height)] = 145;
          yuv[u_pos(i * 1 + 0, y * 1 + 0, width, height)] = 147;
          yuv[v_pos(i * 1 + 0, y * 1 + 0, width, height)] = 44;
          break;
        case 3: // Cyan
          yuv[y_pos(i * 2 + 0, y * 2 + 0, width, height)] = 133;
          yuv[y_pos(i * 2 + 1, y * 2 + 0, width, height)] = 133;
          yuv[y_pos(i * 2 + 0, y * 2 + 1, width, height)] = 133;
          yuv[y_pos(i * 2 + 1, y * 2 + 1, width, height)] = 133;
          yuv[u_pos(i * 1 + 0, y * 1 + 0, width, height)] = 63;
          yuv[v_pos(i * 1 + 0, y * 1 + 0, width, height)] = 53;
          break;
        case 4: // Magenta
          yuv[y_pos(i * 2 + 0, y * 2 + 0, width, height)] = 63;
          yuv[y_pos(i * 2 + 1, y * 2 + 0, width, height)] = 63;
          yuv[y_pos(i * 2 + 0, y * 2 + 1, width, height)] = 63;
          yuv[y_pos(i * 2 + 1, y * 2 + 1, width, height)] = 63;
          yuv[u_pos(i * 1 + 0, y * 1 + 0, width, height)] = 193;
          yuv[v_pos(i * 1 + 0, y * 1 + 0, width, height)] = 204;
          break;
        case 5: // Red
          yuv[y_pos(i * 2 + 0, y * 2 + 0, width, height)] = 51;
          yuv[y_pos(i * 2 + 1, y * 2 + 0, width, height)] = 51;
          yuv[y_pos(i * 2 + 0, y * 2 + 1, width, height)] = 51;
          yuv[y_pos(i * 2 + 1, y * 2 + 1, width, height)] = 51;
          yuv[u_pos(i * 1 + 0, y * 1 + 0, width, height)] = 109;
          yuv[v_pos(i * 1 + 0, y * 1 + 0, width, height)] = 212;
          break;
        case 6: // Blue
          yuv[y_pos(i * 2 + 0, y * 2 + 0, width, height)] = 28;
          yuv[y_pos(i * 2 + 1, y * 2 + 0, width, height)] = 28;
          yuv[y_pos(i * 2 + 0, y * 2 + 1, width, height)] = 28;
          yuv[y_pos(i * 2 + 1, y * 2 + 1, width, height)] = 28;
          yuv[u_pos(i * 1 + 0, y * 1 + 0, width, height)] = 212;
          yuv[v_pos(i * 1 + 0, y * 1 + 0, width, height)] = 120;
          break;
      }

    }
  }

  return yuv;
}
