/**
 * This script should be executed by `lint-staged` before commiting
 * Therefore script assumes that file path exists in `process.argv`
 */

import path from "path"
import { promises as fs } from "fs"
import imagemin from "imagemin"
import imageminGifsicle from "imagemin-gifsicle"
import imageminSvgo from "imagemin-svgo"
import imageminMozjpeg from "imagemin-mozjpeg"
import imageminPngquant from "imagemin-pngquant"

const filePath = process.argv[2]
const src = "static/img"
const dist = src
const log = (msg) => process.stdout.write(msg)

const withImagemin = async (filePath) => {
  log(`Optimising ${filePath} with \`imagemin()\`... `)

  const files = await imagemin([filePath], {
    destination: dist,
    plugins: [
      imageminGifsicle({
        interlaced: true,
        optimizationLevel: 2,
      }),
      imageminSvgo({
        plugins: [
          { removeViewBox: false },
          { cleanupIDs: false },
          { removeUnknownsAndDefaults: false },
          { convertShapeToPath: false },
          { inlineStyles: false },
        ],
      }),
      imageminMozjpeg({ quality: 75 }),
      imageminPngquant({
        quality: [0.6, 0.8],
      }),
    ],
  })

  for (const file of files) {
    const { dir, name, ext } = path.parse(file.sourcePath)
    log("OK!\n")
    file.destinationPath = `${dir.replace(src, dist)}/${name}${ext}`
    await fs.mkdir(path.dirname(file.destinationPath), { recursive: true })
    await fs.writeFile(file.destinationPath, file.data)
  }
}

const main = async () => {
  if (filePath.endsWith("banner.thumb.webp")) {
    log("Skipping optimisation of banner.thumb.webp\n")
    return
  }

  const fileExtension = path.extname(filePath).toLowerCase().replace(".", "")

  const optimisers = {
    "gif|svg|jpg|jpeg|png|webp": withImagemin,
  }

  const optimiseFunc = Object.entries(optimisers).find(([key]) => {
    const regex = new RegExp(key)
    return regex.test(fileExtension)
  })

  if (optimiseFunc) {
    await optimiseFunc[1](filePath)
  } else {
    console.log(`No optimise function found for ${fileExtension} file`)
  }
}

main()
