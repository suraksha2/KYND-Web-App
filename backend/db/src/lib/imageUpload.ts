import path from 'path';

type ImageFormat = {
  mime: string;
  aliases: string[];
  extensions: string[];
  signature: (buffer: Buffer) => boolean;
};

const formats: ImageFormat[] = [
  {
    mime: 'image/jpeg',
    aliases: ['image/jpeg', 'image/jpg'],
    extensions: ['.jpg', '.jpeg'],
    signature: (buffer) => buffer.length >= 3
      && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  {
    mime: 'image/png',
    aliases: ['image/png'],
    extensions: ['.png'],
    signature: (buffer) => buffer.length >= 8
      && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/gif',
    aliases: ['image/gif'],
    extensions: ['.gif'],
    signature: (buffer) => buffer.length >= 6
      && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6)),
  },
  {
    mime: 'image/webp',
    aliases: ['image/webp'],
    extensions: ['.webp'],
    signature: (buffer) => buffer.length >= 12
      && buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.toString('ascii', 8, 12) === 'WEBP',
  },
  {
    mime: 'image/avif',
    aliases: ['image/avif'],
    extensions: ['.avif'],
    signature: (buffer) => {
      if (buffer.length < 16 || buffer.toString('ascii', 4, 8) !== 'ftyp') return false;
      const boxSize = buffer.readUInt32BE(0);
      if (boxSize < 16 || boxSize > buffer.length || (boxSize - 16) % 4 !== 0) return false;
      const brands = [buffer.toString('ascii', 8, 12)];
      for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
        brands.push(buffer.toString('ascii', offset, offset + 4));
      }
      return brands.includes('avif') || brands.includes('avis');
    },
  },
];

export function validateImageUpload(
  buffer: Buffer,
  declaredMime: string,
  originalName: string
): { mime: string; extension: string } | null {
  const extension = path.extname(originalName).toLowerCase();
  const format = formats.find((candidate) =>
    candidate.aliases.includes(declaredMime.toLowerCase())
    && candidate.extensions.includes(extension)
    && candidate.signature(buffer)
  );

  return format ? { mime: format.mime, extension } : null;
}
