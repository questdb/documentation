const color = {
  draculaBackground: "#2d2d2d",
  draculaForeground: "#ffffff",
  draculaSelection: "#44475a",
  draculaComment: "#8899cc",
  draculaRed: "#ff4466",
  draculaOrange: "#ffaa33",
  draculaYellow: "#ffee55",
  draculaGreen: "#44ff77",
  draculaPurple: "#bb77ff",
  draculaCyan: "#55eeff",
  draculaPink: "#ff55bb",
}

const theme = {
  plain: {
    color: color.draculaForeground,
    backgroundColor: color.draculaBackground,
  },
  styles: [
    {
      types: ["prolog", "constant", "boolean", "builtin"],
      style: {
        color: color.draculaPurple,
      },
    },
    {
      types: ["inserted", "function"],
      style: {
        color: color.draculaCyan,
      },
    },
    {
      types: ["dataType"],
      style: {
        color: color.draculaCyan,
        fontStyle: "italic",
      },
    },
    {
      types: ["deleted"],
      style: {
        color: color.draculaRed,
      },
    },
    {
      types: ["changed"],
      style: {
        color: color.draculaOrange,
      },
    },
    {
      types: ["punctuation", "symbol"],
      style: {
        color: color.draculaForeground,
      },
    },
    {
      types: ["string", "char", "tag", "selector"],
      style: {
        color: color.draculaYellow,
      },
    },
    {
      types: ["variable"],
      style: {
        color: color.draculaPurple,
        fontStyle: "italic",
      },
    },
    {
      types: ["keyword", "operator"],
      style: {
        color: color.draculaPink,
      },
    },
    {
      types: ["number", "time-unit", "hex-integer", "integer", "floating-point-number"],
      style: {
        color: color.draculaGreen,
      },
    },
    {
      types: ["comment"],
      style: {
        color: color.draculaComment,
      },
    },
    {
      types: ["attr-name"],
      style: {
        color: "rgb(241, 250, 140)",
      },
    },
    {
      types: ['questdb-keyword'],
      style: {
        color: color.draculaPink,
      },
    },
    {
      types: ['questdb-function'],
      style: {
        color: color.draculaCyan,
      },
    },
    {
      types: ['questdb-datatype'],
      style: {
        color: color.draculaCyan,
        fontStyle: 'italic',
      },
    },
    {
      types: ['questdb-constant'],
      style: {
        color: color.draculaPurple,
      },
    },
    {
      types: ["sql-variable"],
      style: {
        color: color.draculaPurple,
        fontStyle: "italic"
      }
    },
    {
      types: ['array'],
      style: {
        color: color.draculaPink,
      },
    }
  ],
}

module.exports = theme
