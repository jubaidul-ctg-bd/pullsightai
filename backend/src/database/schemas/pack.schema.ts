import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'
import * as mongoosePaginate from 'mongoose-paginate-v2'
import * as uniqueValidator from 'mongoose-unique-validator'

export type PackDocument = Pack & Document

@Schema({ timestamps: true, versionKey: false })
export class Pack {
    @Prop({ required: false })
    highlight: string

    @Prop({ required: true })
    title: string

    @Prop({ required: true })
    description: string

    @Prop({ required: true, min: 0 })
    price: number

    @Prop({ required: true, min: 0 })
    token: number

    @Prop({ default: true })
    isActive: boolean

    @Prop({ default: true })
    isPublic: boolean

    @Prop({ default: 0 })
    priority: number

    @Prop({ required: false })
    stripeProductId: string
}

const schema = SchemaFactory.createForClass(Pack)

schema.plugin(uniqueValidator, {
    message: '{PATH} already exists!'
})
schema.plugin(mongoosePaginate)
export const PackSchema = schema
