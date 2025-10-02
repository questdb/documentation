import matplotlib.pyplot as plt
import matplotlib.patches as mpatches


markdown_table = """
| From \\ To | String | Boolean | Char  | Byte  | Short | Int   | Long  | Long256 | Float | Double | Decimal | Date  | Timestamp | Symbol | Binary |
| --------- | ------ | ------- | ----- | ----- | ----- | ----- | ----- | ------- | ----- | ------ | ------- | ----- | --------- | ------ | ------ |
| String    |        | `E`     | `E*`  | `E`   | `E`   | `I`   | `I`   | `I`     | `I`   | `I`    | `E`     | `I`   | `I`       | `I`    | `N/A`  |
| Boolean   | `I`    |         | `I`   | `I`   | `I`   | `I`   | `I`   | `I`     | `I`   | `I`    | `N/A`   | `I`   | `I`       | `I`    | `N/A`  |
| Char      | `I`    | `N/A`   |       | `E*`  | `I`   | `I`   | `I`   | `I`     | `I`   | `I`    | `N/A`   | `I`   | `I`       | `I`    | `N/A`  |
| Byte      | `I`    | `E*`    | `I`   |       | `I`   | `I`   | `I`   | `I`     | `I`   | `I`    | `I`     | `I`   | `I`       | `I`    | `N/A`  |
| Short     | `I`    | `E*`    | `E*`  | `I`   |       | `I`   | `I`   | `I`     | `I`   | `I`    | `I`     | `I`   | `I`       | `I`    | `N/A`  |
| Int       | `E`    | `E*`    | `E*`  | `E*`  | `E*`  |       | `I`   | `I`     | `I*`  | `I`    | `I`     | `I`   | `I`       | `I`    | `N/A`  |
| Long      | `E`    | `E*`    | `E*`  | `E*`  | `E*`  | `E*`  |       | `I`     | `E*`  | `I*`   | `I`     | `I`   | `I`       | `E`    | `N/A`  |
| Long256   | `E`    | `E*`    | `E*`  | `E*`  | `E*`  | `E*`  | `E*`  |         | `E*`  | `E*`   | `N/A`   | `E*`  | `E*`      | `E*`   | `N/A`  |
| Float     | `E`    | `N/A`   | `E*`  | `E*`  | `E*`  | `I*`  | `I*`  | `I*`    |       | `I`    | `E*`    | `I*`  | `I*`      | `I`    | `N/A`  |
| Double    | `E`    | `N/A`   | `E*`  | `E*`  | `E*`  | `E*`  | `I*`  | `I*`    | `E*`  |        | `E*`    | `I*`  | `I*`      | `E`    | `N/A`  |
| Decimal   | `E`    | `N/A`   | `N/A` | `E!`  | `E!`  | `E!`  | `E!`  | `N/A`   | `E*`  | `E*`   |         | `N/A` | `N/A`     | `N/A`  | `N/A`  |
| Date      | `E`    | `E*`    | `E*`  | `E*`  | `E*`  | `E*`  | `I`   | `I`     | `E*`  | `I*`   | `N/A`   |       | `I`       | `E`    | `N/A`  |
| Timestamp | `E`    | `E*`    | `E*`  | `E*`  | `E*`  | `E*`  | `I`   | `I`     | `E*`  | `I*`   | `N/A`   | `I*`  |           | `E`    | `N/A`  |
| Symbol    | `I`    | `E`     | `E`   | `E`   | `E`   | `E`   | `I`   | `I`     | `E`   | `I`    | `N/A`   | `I`   | `I`       |        | `N/A`  |
| Binary    | `N/A`  | `N/A`   | `N/A` | `N/A` | `N/A` | `N/A` | `N/A` | `N/A`   | `N/A` | `N/A`  | `N/A`   | `N/A` | `N/A`     | `N/A`  | `N/A`  |
"""

# --- Parse Markdown into matrix ---
lines = [line.strip() for line in markdown_table.strip().split("\n") if line.strip()]
header = [h.strip() for h in lines[0].split("|")[1:-1]]  # remove leading/trailing pipe
rows = []

matrix = {}
for line in lines[2:]:  # skip header + separator
    parts = [p.strip().strip("`") for p in line.split("|")[1:-1]]
    row_name, values = parts[0], parts[1:]
    matrix[row_name] = dict(zip(header[1:], values))  # map To-cols to values
    rows.append(row_name)

cols = header[1:]

# --- Color mapping ---
color_map = {
    "": "white",
    "I": "#a6d96a",    # implicit
    "E": "#fdae61",    # explicit
    "I*": "#313695",   # implicit precision loss
    "E*": "#d73027",   # explicit precision loss
    "E!": "#e08214",   # explicit warning
    "N/A": "#7f7f7f"   # grey
}

# --- Plot ---
fig, ax = plt.subplots(figsize=(5, 4))

for i, row in enumerate(rows):
    for j, col in enumerate(cols):
        val = matrix[row].get(col, "")
        ax.add_patch(plt.Rectangle(
            (j, i), 1, 1,
            facecolor=color_map.get(val, "white"),
            edgecolor="black", linewidth=0.5
        ))

# Configure ticks
ax.set_xticks([i + 0.5 for i in range(len(cols))])
ax.set_yticks([i + 0.5 for i in range(len(rows))])
ax.set_xticklabels(cols, rotation=90)
ax.set_yticklabels(rows)

# Put X axis labels at the top
ax.xaxis.tick_top()

ax.set_xlim(0, len(cols))
ax.set_ylim(0, len(rows))
ax.invert_yaxis()
ax.set_aspect("equal")

# Axis labels
ax.set_xlabel("TO", labelpad=20)
ax.xaxis.set_label_position("top")

ax.set_ylabel("FROM", labelpad=20)
ax.yaxis.set_label_position("left")

# Legend centered at bottom
legend_elements = [
    mpatches.Patch(facecolor="#a6d96a", edgecolor="black", label="Implicit"),
    mpatches.Patch(facecolor="#fdae61", edgecolor="black", label="Explicit"),
    mpatches.Patch(facecolor="#313695", edgecolor="black", label="Implicit (precision loss)"),
    mpatches.Patch(facecolor="#d73027", edgecolor="black", label="Explicit (precision loss)"),
    mpatches.Patch(facecolor="#7f7f7f", edgecolor="black", label="N/A")
]
ax.legend(handles=legend_elements,
          bbox_to_anchor=(0.5, -0.05), loc="upper center", ncol=3, frameon=False)

# Save directly to file
path = "../static/images/docs/castmap.jpg"
plt.savefig(path, dpi=300, bbox_inches="tight")
plt.close()
print("file written to: " + path)
