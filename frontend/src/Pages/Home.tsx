import React from "react";
import logo from "../Images/medicine-bottle.webp";
import "./Home.css";
import leaf from "../Images/leaf.png";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../Context/AuthContext";
import { landingPathForRole } from "../utils/roleLanding";
import { PublicHeader } from "../Components/PublicHeader";

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();


  const handleGetStarted = () => {
    if (!user) {
      navigate("/login",{state:{redirectTo:true}});
      return;
    }

    // Shared with the login page so a new role cannot be added in one place and
    // forgotten in the other. HR was: this branch had no case for it, so the button
    // navigated to "/" - the page already on screen - and read as broken.
    navigate(landingPathForRole(user.role));
  };


  return (
    <div className="relative bg-homepage min-h-screen text-white px-4 sm:px-6 md:px-14">
      <PublicHeader />
        {/* Slogan under nav */}
        <div className="text-center mt-6 md:mt-10 max-w-lg mx-auto">
        <p className="italic text-gray-200/70 text-xl md:text-2xl font-serif leading-snug md:leading-relaxed relative">
          {/* The decorative quotes are pinned to the edges of this paragraph, which is
              the full width of the screen on a phone - so they detached from the words
              and read as stray punctuation in the corners. They only make sense once
              the line is wide enough for them to sit beside it. */}
          <span className="hidden sm:block absolute -left-2 -top-4 text-5xl md:text-6xl text-gray-400/50 font-serif">“</span>
          We will serve you with our eyelashes
          <span className="hidden sm:block absolute -right-2 -bottom-4 text-5xl md:text-6xl text-gray-400/50 font-serif">”</span>
        </p>
        <div className="mt-3 h-1 w-28 bg-gray-400/50 mx-auto rounded-full"></div>
        </div>
      {/* Hero Section */}
      <main className="relative z-20 py-8 sm:py-12 lg:py-20 ">
        {/* Two columns from lg, not md. At exactly 768px the md grid split the screen
            in half and put 72px type in a 288px column, so the headline overflowed its
            own column and the bottle in the next one landed on top of it - the words
            "Pharmacy Stock Management." were unreadable behind the image. A tablet now
            gets the same stacked layout as a phone, which it has the width to carry. */}
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-2 items-center gap-8">
          <div className="lg:pl-12 xl:pl-20 relative lg:-translate-y-12">
            <h1 className="font-extrabold text-[32px] sm:text-[44px] md:text-[56px] lg:text-[72px] leading-[1.1]">
              <span className="sm:whitespace-nowrap">Pharmacy Stock</span>
              <br />
              Management.
            </h1>

            <p className="text-gray-200/80 mt-4 max-w-[420px] text-base md:text-lg">
              <span className="sm:whitespace-nowrap">Control your pharmacy stock</span>
              <br />
              without stress or confusion.
            </p>

            <div className="mt-4">
              <button
                onClick={handleGetStarted}
                className="inline-block bg-[#003465] hover:bg-[#00274d] text-white font-bold py-4 px-8 text-xl sm:py-5 sm:px-10 sm:text-2xl rounded-lg shadow-lg"
              >
                Get Started
              </button>
            </div>
          </div>

          <div className="relative flex justify-center lg:justify-end items-center">
            {/* rotate-60 is not a real class - Tailwind's rotate scale is
                0/1/2/3/6/12/45/90/180 and theme.extend is empty - so it has always been
                a no-op and the bottle's tilt comes from the artwork itself. Left exactly
                as written: replacing it with an arbitrary value like rotate-[25deg]
                would silently start rotating the image for the first time, and would
                widen the hover swing, since hover:-rotate-3 is an absolute angle. */}
            <img
              src={logo}
              alt="Medicine bottle"
              className="w-[180px] sm:w-[260px] md:w-[320px] lg:w-[380px] transform rotate-60 drop-shadow-2xl transition-transform duration-500 hover:-rotate-3 hover:scale-105"
              style={{ filter: "drop-shadow(-30px 90px 20px rgba(2, 6, 23, 0.24))" }}
            />
          </div>
        </div>

        {/* Decorative leaves */}
        <img src={leaf} alt="leaf left" className="hidden lg:block absolute left-6 top-20 w-30 opacity-100 transform -rotate-45 pointer-events-none" />
        <img src={leaf} alt="leaf right" className="hidden lg:block absolute right-11 top-2 w-20 opacity-100 transform rotate-6 pointer-events-none" />
        <img src={leaf} alt="leaf left" className="hidden lg:block absolute left-16 top-34 w-14 opacity-100 transform -rotate-65 pointer-events-none" />
        <img src={leaf} alt="leaf right" className="hidden lg:block absolute right-12 top-41 w-12 opacity-100 transform -rotate-90 pointer-events-none" />
        <img src={leaf} alt="leaf middle" className="hidden lg:block absolute left-1/2 top-1/2 w-21 opacity-100 transform -translate-x-1/2 translate-y-1/2 -rotate-45 pointer-events-none" />
      </main>
    </div>
  );
};

export default Home;
