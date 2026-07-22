import { ImageResponse } from 'next/og';

export const alt = 'Morpheus — Is it a dream?';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';
export const runtime = 'edge';

function toBase64(bytes: Uint8Array) {
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }

  return btoa(binary);
}

export default async function OpenGraphImage() {
  const backgroundBytes = await fetch(
    new URL('./morpheus-og-background.png', import.meta.url),
  ).then((response) => response.arrayBuffer());
  const background = `data:image/png;base64,${toBase64(
    new Uint8Array(backgroundBytes),
  )}`;

  return new ImageResponse(
    (
      <div
        style={{
          background: '#02070b',
          color: '#f2f8fb',
          display: 'flex',
          height: '100%',
          overflow: 'hidden',
          position: 'relative',
          width: '100%',
        }}
      >
        <img
          alt=""
          height={630}
          src={background}
          style={{
            height: '100%',
            left: 0,
            objectFit: 'cover',
            position: 'absolute',
            top: 0,
            width: '100%',
          }}
          width={1200}
        />
        <div
          style={{
            background:
              'linear-gradient(90deg, rgba(0, 0, 0, 0.88) 0%, rgba(0, 0, 0, 0.55) 42%, rgba(0, 0, 0, 0) 72%)',
            display: 'flex',
            height: '100%',
            left: 0,
            position: 'absolute',
            top: 0,
            width: '100%',
          }}
        />
        <div
          style={{
            alignItems: 'flex-start',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 84px',
            position: 'relative',
          }}
        >
          <div
            style={{
              fontFamily: 'serif',
              fontSize: 138,
              letterSpacing: '-0.05em',
              lineHeight: 1,
            }}
          >
            Morpheus
          </div>
          <div
            style={{
              color: '#b8dbeb',
              display: 'flex',
              fontFamily: 'serif',
              fontSize: 38,
              fontStyle: 'italic',
              marginTop: 22,
            }}
          >
            Is it a dream?
          </div>
        </div>
      </div>
    ),
    size,
  );
}
