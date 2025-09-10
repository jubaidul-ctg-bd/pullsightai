import { Users, Building2, Code } from "lucide-react";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    type CarouselApi,
} from "@/components/ui/carousel";
import { useEffect, useState } from "react";
import Image from "next/image";

const testimonials = [
    {
        id: 1,
        quote: "Pullsight helps us keep code reviews moving without burning out senior engineers. That’s been a big win for us.",
        author: "Mladen Grozev",
        avatar: "/images/avatars/2.png",
        position: "CTO",
        company: "GetHookd",
    },
    // {
    //     id: 2,
    //     quote: "The AI-powered code reviews have significantly improved our code quality. We've reduced bugs by 60% since implementing PullSight.",
    //     author: "Michael Chen",
    //     avatar: "/images/avatars/2.png",
    //     position: "Senior Developer",
    //     company: "StartupX",
    // },
    // {
    //     id: 3,
    //     quote: "PullSight's privacy-first approach gave us the confidence to use AI for code review. SOC2 compliance was exactly what we needed.",
    //     author: "Sarah Johnson",
    //     avatar: "/images/avatars/1.png",
    //     position: "CTO",
    //     company: "SecureApp Inc",
    // },
];

const Testimonial = () => {
    const [api, setApi] = useState<CarouselApi>();
    const [current, setCurrent] = useState(0);

    useEffect(() => {
        if (!api) {
            return;
        }

        setCurrent(api.selectedScrollSnap());

        api.on("select", () => {
            setCurrent(api.selectedScrollSnap());
        });
    }, [api]);

    return (
        <div className="w-full max-w-8xl mx-auto bg-[#3AF7AF] text-neutral-800 rounded-4xl py-12">
            <Carousel setApi={setApi} className="w-full">
                <CarouselContent>
                    {testimonials.map((testimonial) => {
                        return (
                            <CarouselItem key={testimonial.id}>
                                <div
                                    className={`rounded-2xl p-4 lg:p-8 relative overflow-hidden`}
                                >
                                    <div className="relative z-10">
                                        <div className="flex items-center justify-center mb-6">
                                            <Image
                                                className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center"
                                                src={testimonial.avatar}
                                                alt="User Avatar"
                                                width={64}
                                                height={64}
                                            />
                                        </div>
                                        <blockquote className="text-2xl lg:text-4xl font-bold text-center mb-6 max-w-3xl mx-auto leading-[1.3]">
                                            {testimonial.quote}
                                        </blockquote>
                                        <div className="text-center flex flex-col lg:flex-row gap-1 items-center justify-center text-neutral-600">
                                            <p className="">
                                                {testimonial.author},{" "}
                                                {testimonial.position} at
                                            </p>
                                            <p className="">
                                                {testimonial.company}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </CarouselItem>
                        );
                    })}
                </CarouselContent>
            </Carousel>

            {/* Dot Navigation */}
            <div className="flex justify-center mt-6 space-x-2">
                {testimonials.map((_, index) => (
                    <button
                        key={index}
                        className={`h-2.5 rounded-full transition-all duration-300 ${
                            index === current
                                ? "bg-white shadow-lg w-7"
                                : "bg-gray-300 w-2.5"
                        }`}
                        onClick={() => api?.scrollTo(index)}
                    />
                ))}
            </div>
        </div>
    );
};

export default Testimonial;
