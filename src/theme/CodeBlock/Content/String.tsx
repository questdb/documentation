import React, { useState, useEffect } from "react";
import clsx from "clsx";
import { useThemeConfig, usePrismTheme } from "@docusaurus/theme-common";
import {
  parseLanguage,
  parseLines,
  containsLineNumbers,
  useCodeWordWrap,
} from "@docusaurus/theme-common/internal";
import { Highlight, type Language } from "prism-react-renderer";
import Line from "@theme/CodeBlock/Line";
import CopyButton from "@theme/CodeBlock/CopyButton";
import WordWrapButton from "@theme/CodeBlock/WordWrapButton";
import Container from "@theme/CodeBlock/Container";
import type { Props as OriginalProps } from "@theme/CodeBlock";

import { QuestDbSqlRunnerEmbedded } from '@site/src/components/QuestDbSqlRunnerEmbedded';

import styles from "./styles.module.css";

type Props = OriginalProps & {
  demo?: boolean;
  execute?: boolean; // For inline SQL execution
  questdbUrl?: string; // URL for QuestDB instance
};

const codeBlockTitleRegex = /title=(?<quote>["'])(?<title>.*?)\1/;
const codeBlockDemoRegex = /\bdemo\b/;
const codeBlockExecuteRegex = /\bexecute\b/;

function normalizeLanguage(language: string | undefined): string | undefined { return language?.toLowerCase(); }
function parseCodeBlockTitle(metastring?: string): string { return metastring?.match(codeBlockTitleRegex)?.groups?.title ?? ""; }
function parseCodeBlockDemo(metastring?: string): boolean { return codeBlockDemoRegex.test(metastring ?? ""); }
function parseCodeBlockExecute(metastring?: string): boolean { return codeBlockExecuteRegex.test(metastring ?? "");}


export default function CodeBlockString({
                                          children,
                                          className: blockClassName = "",
                                          metastring,
                                          title: titleProp,
                                          showLineNumbers: showLineNumbersProp,
                                          language: languageProp,
                                          demo: demoProp,
                                          execute: executeProp,
                                          questdbUrl: questdbUrlProp,
                                        }: Props): JSX.Element {
  const {
    prism: { defaultLanguage, magicComments },
  } = useThemeConfig();
  const language = normalizeLanguage(
    languageProp ?? parseLanguage(blockClassName) ?? defaultLanguage,
  );

  const prismTheme = usePrismTheme();
  const wordWrap = useCodeWordWrap();

  const title = parseCodeBlockTitle(metastring) || titleProp;
  const demo = parseCodeBlockDemo(metastring) || demoProp;
  const enableExecute = parseCodeBlockExecute(metastring) || executeProp;

  const { lineClassNames, code: initialCode, tokens: initialTokens } = parseLines(children, {
    metastring,
    language,
    magicComments,
  });
  const showLineNumbers = showLineNumbersProp ?? containsLineNumbers(metastring);

  const [editableCode, setEditableCode] = useState<string>(initialCode);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  useEffect(() => {
    setEditableCode(initialCode);
  }, [initialCode]);

  const demoUrl = demo
    ? `https://demo.questdb.io/?query=${encodeURIComponent(editableCode)}&executeQuery=true` // Use editableCode
    : null;

  const handleDemoClick = () => {
    if (typeof (window as any).posthog?.capture === 'function') {
      (window as any).posthog.capture("demo_started", { title });
    }
  };

  const [showExecutionResults, setShowExecutionResults] = useState<boolean>(false);

  const currentQuestDbUrl = questdbUrlProp;

  const handleExecuteToggle = () => {
    setShowExecutionResults(prev => !prev);
  };

  const handleEditToggle = () => {
    setIsEditing(prev => !prev);
  };

  const currentLineClassNames = isEditing
    ? lineClassNames
    : parseLines(editableCode, { metastring, language, magicComments }).lineClassNames;


  return (
    <Container
      as="div"
      className={clsx(
        blockClassName,
        language &&
        !blockClassName.includes(`language-${language}`) &&
        `language-${language}`,
        isEditing && styles.codeBlockEditing
      )}
    >
      {title && (
        <div className={styles.codeBlockTitle}>
          <span>{title}</span>
          {demoUrl && (
            <a
              href={demoUrl}
              className={styles.demoLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleDemoClick}
            >
              Demo this query
            </a>
          )}
        </div>
      )}
      <div className={styles.codeBlockContent}>
        {isEditing ? (
          <textarea
            value={editableCode}
            onChange={(e) => setEditableCode(e.target.value)}
            className={clsx(styles.codeBlock, styles.editableCodeArea, "thin-scrollbar")}
            spellCheck="false"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            rows={Math.max(10, editableCode.split('\n').length)}
            style={{
              width: '100%',
              fontFamily: 'var(--ifm-font-family-monospace)',
              fontSize: 'var(--ifm-code-font-size)',
              lineHeight: 'var(--ifm-pre-line-height)',
              backgroundColor: prismTheme.plain.backgroundColor,
              color: prismTheme.plain.color,
              border: 'none',
              resize: 'vertical',
            }}
          />
        ) : (
          <Highlight
            theme={prismTheme}
            code={editableCode} // Use editableCode
            language={(language ?? "text") as Language}
          >
            {({ className, style, tokens, getLineProps, getTokenProps }) => (
              <pre
                tabIndex={0}
                ref={wordWrap.codeBlockRef}
                className={clsx(className, styles.codeBlock, "thin-scrollbar")}
                style={style}
              >
                <code
                  className={clsx(
                    styles.codeBlockLines,
                    showLineNumbers && styles.codeBlockLinesWithNumbering,
                  )}
                >
                  {tokens.map((line, i) => (
                    <Line
                      key={i}
                      line={line}
                      getLineProps={getLineProps}
                      getTokenProps={getTokenProps}
                      classNames={currentLineClassNames[i]}
                      showLineNumbers={showLineNumbers}
                    />
                  ))}
                </code>
              </pre>
            )}
          </Highlight>
        )}
        <div className={styles.buttonGroup}>
          <button
            onClick={handleEditToggle}
            className={clsx(styles.codeButton, styles.editButton)}
            title={isEditing ? "View Code" : "Edit Code"}
          >
            {isEditing ? 'View Code' : 'Edit Code'}
          </button>
          {(wordWrap.isEnabled || wordWrap.isCodeScrollable) && (
            <WordWrapButton
              className={styles.codeButton}
              onClick={() => wordWrap.toggle()}
              isEnabled={wordWrap.isEnabled}
            />
          )}
          <CopyButton className={styles.codeButton} code={editableCode} />
          {enableExecute && (
            <button
              onClick={handleExecuteToggle}
              className={clsx(styles.codeButton, styles.executeButton)}
              title={showExecutionResults ? "Hide execution results" : "Execute this query"}
            >
              {showExecutionResults ? 'Hide Results' : 'Execute Query'}
            </button>
          )}
        </div>
      </div>

      {enableExecute && showExecutionResults && (
        <QuestDbSqlRunnerEmbedded
          queryToExecute={editableCode}
          questdbUrl={currentQuestDbUrl}
        />
      )}
    </Container>
  );
}