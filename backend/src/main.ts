import { ValidationPipe, VersioningType } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import * as bodyParser from 'body-parser'
import * as compression from 'compression'
import helmet from 'helmet'
import * as morgan from 'morgan'
import { AppModule } from './app.module'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)

    const options = {
        origin: [
            'http://localhost:3000',
            'https://dev-web.pullsight.ai',
            'https://pullsight.ai',
            'https://stage-web.pullsight.ai'
        ],
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        preflightContinue: false,
        optionsSuccessStatus: 204,
        credentials: true
    }

    // Starts listening for shutdown hooks
    app.enableShutdownHooks()
    app.use(morgan('tiny'))

    // Increase request body size limit (default: 100kb)
    app.use(bodyParser.json({ limit: '10mb' })) // Set the limit as per needs
    app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }))
    app.enableCors(options)
    //app.enableCors()
    app.use(helmet())
    app.use(compression())
    app.enableVersioning({
        type: VersioningType.URI
    })
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true
        })
    )

    // Setup graceful shutdown with 10-minute timeout
    const server = await app.listen(process.env.PORT ?? 3000)

    // Set server timeout to 10 minutes (600 seconds)
    server.timeout = 600000 // 10 minutes in milliseconds
    server.keepAliveTimeout = 65000 // Keep alive timeout (recommended to be longer than load balancer timeout)
    server.headersTimeout = 66000 // Headers timeout (should be longer than keepAliveTimeout)    // Graceful shutdown handlers
    const gracefulShutdown = (signal: string) => {
        console.log(`Received ${signal}. Starting graceful shutdown...`)

        server.close((err) => {
            if (err) {
                console.error('Error during server close:', err)
                process.exit(1)
            }
            console.log('HTTP server closed.')

            // Close the NestJS application
            app.close()
                .then(() => {
                    console.log('NestJS application closed.')
                    process.exit(0)
                })
                .catch((error) => {
                    console.error('Error during NestJS app close:', error)
                    process.exit(1)
                })
        })

        // Force shutdown after 10 minutes if graceful shutdown doesn't complete
        setTimeout(() => {
            console.error(
                'Graceful shutdown timeout reached. Forcing shutdown...'
            )
            process.exit(1)
        }, 600000) // 10 minutes
    }

    // Listen for shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))

    console.log(`Application is running on port ${process.env.PORT ?? 3000}`)
    console.log('Graceful shutdown enabled with 10-minute timeout')
}
bootstrap()
