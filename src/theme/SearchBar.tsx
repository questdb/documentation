import { useEffect } from 'react';
import SearchBar from '@theme-original/SearchBar';
import type SearchBarType from '@theme/SearchBar';
import type {WrapperProps} from '@docusaurus/types';

type Props = WrapperProps<typeof SearchBarType>;

// Not anyones favourite, but this prevents 
// search results from being opened in a new tab

export default function SearchBarWrapper(props: Props): JSX.Element {
  useEffect(() => {
    const handleSearchResults = () => {
      const searchResults = document.querySelector('.DocSearch-content');
      if (searchResults) {
        const links = searchResults.getElementsByTagName('a');
        Array.from(links).forEach(link => {
          link.setAttribute('target', '_blank');
          link.setAttribute('rel', 'noopener noreferrer');
        });
      }
    };

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
          handleSearchResults();
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <SearchBar {...props} />
    </>
  );
}
