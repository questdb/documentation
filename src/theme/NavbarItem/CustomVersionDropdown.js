import Link from '@docusaurus/Link';
import React, { useEffect, useState } from 'react';

export default function CustomVersionDropdown() {
  const [version, setVersion] = useState('latest');

  useEffect(() => {
    fetch('https://github-api.questdb.io/github/latest')
      .then((res) => res.json())
      .then((data) => {
        if (data?.name) {
          setVersion(data.name);
        }
      })
      .catch(() => {
        // Fallback to "latest"
      });
  }, []);

  const versionUrl = `https://github.com/questdb/questdb/releases/tag/${version}`;

  return (
    <div className="navbar__item dropdown dropdown--hoverable dropdown--left">
      <Link
        className="navbar__item navbar__link header-github-link font-semibold font-sans font-normal"
        aria-label="GitHub latest release"
        href={versionUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        {version}
      </Link>
      <ul className="dropdown__menu">
        <li>
          <Link
            to="https://questdb.com/release-notes"
            target="_blank"
            className="dropdown__link font-semibold">
            Release Notes
          </Link>
        </li>
        <li>
          <Link
            to="https://github.com/orgs/questdb/projects/1/views/5"
            className="dropdown__link font-semibold"
            target="_blank"
          >
            Roadmap
          </Link>
        </li>
      </ul>
    </div>
  );
}
