import { Props as ItemProps } from "./item"

export type LinkSection = {
  id?: string
  title?: string
  items: ItemProps[]
  highlight?: true
}

export type Column = {
  title: string
  sections: LinkSection[]
}
