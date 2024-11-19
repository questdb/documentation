import clsx from 'clsx';
import React, { useState } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './styles.module.css';

type Props = {
  alt: string;
  height?: number;
  margin?: boolean;
  shadow?: boolean;
  small?: boolean;
  src: string;
  jumbo: boolean;
  title?: string;
  width?: number;
  forceTheme?: 'light' | 'dark';
};

const Screenshot: React.FC<Props> = ({
  alt,
  height,
  margin = true,
  shadow = true,
  small = false,
  src,
  title,
  jumbo,
  width,
  forceTheme,
}) => {
  const [zoomed, setZoomed] = useState(false);

  // Use useBaseUrl to resolve the src
  const resolvedSrc = useBaseUrl(src);

  return (
    <figure
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <img
          onClick={() => setZoomed(!zoomed)}
          alt={alt}
          className={clsx(styles.image, {
            [styles.zoomed]: zoomed,
            [styles.margin]: margin,
            [styles.shadow]: shadow,
            [styles.small]: small,
            [styles.jumbo]: jumbo,
            [styles.title]: title != null,
            [styles.forceDark]: forceTheme === 'dark',
            [styles.forceLight]: forceTheme === 'light',
          })}
          height={height}
          src={resolvedSrc}
          width={width}
          loading="lazy"
        />
        {title != null && (
          <figcaption className={styles.caption}>{title}</figcaption>
        )}
      </div>
    </figure>
  );
};

export default Screenshot;
