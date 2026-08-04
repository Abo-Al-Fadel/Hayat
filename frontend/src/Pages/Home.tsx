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
        {/* text-base below sm is what keeps the slogan on one line at 360px. At text-xl
            it needed ~340px of a 328px column and broke after "our", leaving "eyelashes"
            stranded on a line of its own. md: is untouched. */}
        <p className="italic text-gray-200/70 text-base sm:text-lg md:text-2xl font-serif leading-snug md:leading-relaxed relative whitespace-nowrap md:whitespace-normal">
          {/* Two sets of quote marks, and only ever one of them on screen.
              The absolute pair below is pinned to the edges of this paragraph, which is
              wider than the sentence inside it - fine once the line is long enough to
              reach them, wrong below that, where they detach from the words and read as
              stray punctuation floating in the corners. So below md the inline pair is
              used instead: real punctuation sitting right against the text, which is
              where a quote mark belongs when there is no room to spare. */}
          <span aria-hidden className="md:hidden text-xl leading-none align-[-0.2em] text-gray-400/50 font-serif mr-0.5">“</span>
          <span className="hidden md:block absolute -left-2 -top-4 text-5xl md:text-6xl text-gray-400/50 font-serif">“</span>
          We will serve you with our eyelashes
          <span aria-hidden className="md:hidden text-xl leading-none align-[-0.2em] text-gray-400/50 font-serif ml-0.5">”</span>
          <span className="hidden md:block absolute -right-2 -bottom-4 text-5xl md:text-6xl text-gray-400/50 font-serif">”</span>
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
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-2 items-center max-md:gap-6 gap-8">
          {/* Centred below md. The slogan, the rule under it and the bottle are all
              centred already, so left-aligning only the middle three elements was what
              made the phone layout read as three unrelated pieces rather than one
              column. */}
          <div className="lg:pl-12 xl:pl-20 relative lg:-translate-y-12 max-md:text-center">
            <h1 className="font-extrabold text-[32px] sm:text-[44px] md:text-[56px] lg:text-[72px] leading-[1.1]">
              <span className="sm:whitespace-nowrap">Pharmacy Stock</span>
              <br />
              Management.
            </h1>

            {/* mt-4 between every pair made the three elements one undifferentiated
                block. Below md the sentence gets a little more room than the line break
                inside it, and the button gets clearly more than either. */}
            <p className="text-gray-200/80 mt-4 max-md:mt-6 max-w-[420px] max-md:mx-auto text-base md:text-lg">
              <span className="sm:whitespace-nowrap">Control your pharmacy stock</span>
              <br />
              without stress or confusion.
            </p>

            <div className="mt-4 max-md:mt-8">
              <button
                onClick={handleGetStarted}
                className="inline-block max-md:block max-md:w-full max-md:max-w-[340px] max-md:mx-auto bg-[#003465] hover:bg-[#00274d] text-white font-bold py-4 px-8 text-xl sm:py-5 sm:px-10 sm:text-2xl rounded-lg shadow-lg"
              >
                Get Started
              </button>
            </div>
          </div>

          <div className="relative flex justify-center lg:justify-end items-center">
            {/* rotate-60 is not a real class - Tailwind's rotate scale is
                0/1/2/3/6/12/45/90/180 and theme.extend is empty - so it has always been
                a no-op and the bottle's tilt comes from the artwork itself. Leave it:
                replacing it with an arbitrary value like rotate-[25deg] would silently
                start rotating the image for the first time, and would widen the hover
                swing, since hover:-rotate-3 is an absolute angle.

                The widths below md are the phone pass - 180px was a thumbnail on a
                screen with nothing else competing for the space. md and lg are the
                original values and stay put. */}
            <img
              src={logo}
              alt="Medicine bottle"
              className="w-[250px] sm:w-[300px] md:w-[320px] lg:w-[380px] transform rotate-60 drop-shadow-2xl transition-transform duration-500 hover:-rotate-3 hover:scale-105"
              style={{ filter: "drop-shadow(-30px 90px 20px rgba(2, 6, 23, 0.24))" }}
            />
          </div>
        </div>

        {/* Decorative leaves, phone set.
            Behind the content on -z-10 rather than over it like the lg set below: at this
            width the centred text runs nearly edge to edge, so anything painted on top of
            it costs legibility. main is `relative z-20` and so opens a stacking context,
            which keeps these above the page background but under the headline.
            Kept well inside the edges - the hero clips at overflow-hidden, and a leaf
            half outside it reads as a loading artefact rather than decoration. */}
        <img src={leaf} alt="" aria-hidden className="md:hidden absolute -z-10 left-3 top-24 w-14 opacity-50 transform -rotate-45 pointer-events-none" />
        <img src={leaf} alt="" aria-hidden className="md:hidden absolute -z-10 right-4 top-12 w-10 opacity-45 transform rotate-12 pointer-events-none" />
        <img src={leaf} alt="" aria-hidden className="md:hidden absolute -z-10 right-6 bottom-28 w-16 opacity-40 transform rotate-45 pointer-events-none" />
        <img src={leaf} alt="" aria-hidden className="md:hidden absolute -z-10 left-5 bottom-16 w-12 opacity-35 transform -rotate-12 pointer-events-none" />

        {/* Decorative leaves, lg set */}
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
