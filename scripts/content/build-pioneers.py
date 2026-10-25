"""Generates src/content/pioneers.json. Every claim below is limited to what the cited page stated when it was fetched on ACCESSED."""
import json

ACCESSED = "2026-10-25"
W = lambda title, slug: {"title": title, "url": f"https://en.wikipedia.org/wiki/{slug}", "publisher": "Wikipedia", "accessed": ACCESSED}

P = []
def add(**k): P.append(k)

add(id="eugen-langen-and-nikolaus-otto", name="Nikolaus Otto and Eugen Langen", role="Cologne engine makers", year="1876", sortYear=1876, categoryId="engine",
    headline="Turned the four-stroke cycle into a working engine.",
    story="Otto started out as a travelling salesman of coffee, tea, rice and sugar. In 1864 he and Eugen Langen founded N.A. Otto & Cie in Cologne, and their atmospheric engine won a gold medal at the 1867 Paris World Exhibition. In 1876 Otto's engine, which compresses the charge before igniting it, appeared; the sequence is still called the Otto cycle. Gottlieb Daimler, a former manager at the firm, later left and took Wilhelm Maybach with him.",
    caution="A French engineer, Beau de Rochas, held a four-cycle patent from 1862. According to the source it cost Otto one of his patents, which let Daimler sell engines without paying royalties.",
    topicIds=["four-stroke-cycle"], componentIds=[], sources=[W("Nicolaus Otto", "Nicolaus_Otto")])

add(id="etienne-lenoir", name="Étienne Lenoir", role="Inventor of an early commercial gas engine", year="1860", sortYear=1860, categoryId="engine",
    headline="Sold the first widely used gas engine, without compressing the charge.",
    story="Lenoir's engine burned a mixture of coal gas and air, lit by sparks from a Ruhmkorff coil, and he patented it in 1860. Because the mixture was not compressed first it ran quietly but wastefully: real fuel use was far above the advertised figure, and it could overheat and seize without cooling water. Still, 143 had been sold in Paris alone by 1865, and in 1863 his gas-fuelled three-wheeled 'Hippomobile' covered the 18 km from Paris to Joinville-le-Pont in about three hours.",
    topicIds=["four-stroke-cycle", "spark-ignition"], componentIds=[], sources=[W("Étienne Lenoir", "%C3%89tienne_Lenoir")])

add(id="james-watt", name="James Watt", role="Scottish engineer", year="1782–1783", sortYear=1782, categoryId="basics",
    headline="Gave engines a unit of power by measuring them against horses.",
    story="Watt had to explain how much work his steam engines could replace, and the customers' benchmark was the horse. In 1782 he found that a brewery horse could do about 32,400 ft·lbf of work per minute, and the next year he and Matthew Boulton standardised the figure at 33,000 ft·lbf per minute. That is the horsepower on every engine spec sheet today.",
    caution="A popular tale says a brewer demanded an engine matching his strongest horse. The source treats it as legend, and it says where Watt's 180 lbf pull figure came from is unknown.",
    topicIds=["torque-and-power"], componentIds=[], sources=[W("Horsepower", "Horsepower")])

add(id="rudolf-diesel", name="Rudolf Diesel", role="Engineer and inventor", year="1892–1897", sortYear=1892, categoryId="fuel-ignition",
    headline="Chased the theoretical efficiency limit and built the compression-ignition engine.",
    story="Diesel set out to build an engine that approached the maximum theoretical efficiency of the Carnot cycle, convinced that steam engines wasted as much as 90% of their fuel's energy. He received German patent DRP 67207 in 1892, and his first successful engine, the Motor 250/400, was officially tested in 1897. The road was dangerous: an early ammonia-vapour engine exploded during testing and almost killed him, and a high-compression cylinder head burst in another test.",
    caution="Diesel vanished from the steamer SS Dresden on 29 September 1913. Suicide and murder theories remain unresolved, so this entry does not offer a cause.",
    topicIds=["diesel-engines"], componentIds=[], sources=[W("Rudolf Diesel", "Rudolf_Diesel")])

add(id="gottlob-honold", name="Gottlob Honold", role="Engineer in Robert Bosch's workshop", year="1901", sortYear=1901, categoryId="fuel-ignition",
    headline="Worked out Bosch's brief for a hot, long-lasting spark from fixed electrodes.",
    story="Honold (1876–1923) apprenticed in Robert Bosch's workshop in 1891, studied engineering, and came back to Bosch in 1901 to work on ignition. His task was an apparatus that would produce a hot spark of relatively long duration from non-moving electrodes; by December, working with Arnold Zähringer, he had a test model. He also conceived putting parabolic mirrors behind headlamps, and his father was a friend of Robert Bosch's father.",
    caution="This entry records only what the cited biography states: the 1901 brief and test model. It does not date a patent or name him as the spark plug's sole inventor.",
    topicIds=["spark-ignition"], componentIds=["spark-plug"], sources=[W("Gottlob Honold", "Gottlob_Honold")])

add(id="wilhelm-maybach", name="Wilhelm Maybach", role="Engine designer, partner of Gottlieb Daimler", year="1885–1893", sortYear=1885, categoryId="fuel-ignition",
    headline="Taught the petrol engine to mix its own fuel and air.",
    story="After both of Maybach's parents died in the mid-1850s, a philanthropic institution in Reutlingen took him in. He followed Gottlieb Daimler to Karlsruhe in 1869; they patented their petrol engine on 16 December 1883, and in November 1885 Maybach rode their engine-powered wooden Reitwagen. His float-fed carburettor dates from 1885 and his spray-nozzle carburettor was patented in 1893. Electronic fuel injection took until 1958 to reach cars: the Chrysler 300D, DeSoto Adventurer, Dodge D-500 and Plymouth Fury offered the Electrojector.",
    topicIds=["fuel-injection"], componentIds=[], sources=[W("Wilhelm Maybach", "Wilhelm_Maybach"), W("Fuel injection", "Fuel_injection")])

add(id="felix-wankel", name="Felix Wankel", role="Self-taught German engineer", year="1957", sortYear=1957, categoryId="engine",
    headline="Replaced the piston engine with a rotary design that ran in 1957.",
    story="Wankel left school in 1921 without the Abitur and could not afford university, so he taught himself technical subjects and ran an unofficial machine shop in a backyard shed in Heidelberg. He conceived his engine in 1924 and won his first patent in 1929; the first running prototype, built at NSU, ran on 1 February 1957. The NSU Wankel-Spider entered production in 1964, and the Ro 80 saloon was named German Car of the Year for 1968. He never held a driving licence, because he was extremely near-sighted.",
    topicIds=["engine-layouts"], componentIds=[], sources=[W("Felix Wankel", "Felix_Wankel")])

add(id="ernest-henry", name="Ernest Henry", role="Swiss mechanical engineer (1885–1950)", year="1912", sortYear=1912, categoryId="engine",
    headline="Designed the racing engine whose valve gear still dominates.",
    story="Henry's 1912 Peugeot race engine used two overhead camshafts, four valves per cylinder and hemispherical combustion chambers. The Peugeot L76 won the 1912 French Grand Prix, and Jules Goux won the 1913 Indianapolis 500 in one. Sunbeam designs drew on his work, Harry Miller later copied the layout, and Fred Offenhauser's engines carried it forward. Peugeot's own managers nicknamed the secret racing team 'Les Charlatans' because they opposed its approach.",
    topicIds=["valves-and-camshaft"], componentIds=["intake-camshaft", "exhaust-camshaft", "intake-valve", "exhaust-valve"], sources=[W("Ernest Henry (engineer)", "Ernest_Henry_(engineer)")])

add(id="frederick-lanchester", name="Frederick W. Lanchester", role="Engineer and car maker, Birmingham", year="1902", sortYear=1902, categoryId="brakes",
    headline="Patented the disc brake half a century before it caught on.",
    story="Lanchester received patent No. 26,407 for a disc brake on 1 December 1902, and his Birmingham firm used a caliper-type disc brake on Lanchester cars. The friction material was copper, which wore quickly on the dusty, rough roads of the day, making the system impractical. The idea only took hold after Jaguar's C-Type, the only car in the race with disc brakes, won the 1953 24 Hours of Le Mans on discs developed in the UK by Dunlop.",
    caution="'First on a production car' depends on how you count: Crosley used discs on all its cars in 1949–1950 but later went back to drums, and the Citroën DS (1955) was the first sustained mass-production use.",
    topicIds=["disc-brakes"], componentIds=["brake-disc", "brake-caliper"], sources=[W("Frederick W. Lanchester", "Frederick_W._Lanchester"), W("Disc brake", "Disc_brake")])

add(id="fred-duesenberg", name="Fred Duesenberg", role="Engineer and car maker", year="1921", sortYear=1921, categoryId="brakes",
    headline="Put hydraulic brakes on all four wheels of a production car.",
    story="The 1921 Duesenberg Model A was the first production automobile with four-wheel hydraulic brakes, using internal expanding shoes, and Fred Duesenberg's patent applications were filed on 16 November 1920. He was not alone: Henri Perrot of Argyll patented four-wheel brakes in 1913 (using mechanical linkages), and Malcolm Loughead's four-wheel hydraulic system, with band brakes, reached production in late 1923. The payoff was shorter stopping distances, which mattered more as speeds rose.",
    caution="The source notes that Frederick Henry Royce may deserve credit for the hydraulic brake itself, although his version was never manufactured.",
    topicIds=["brake-hydraulics", "disc-brakes"], componentIds=["master-cylinder", "brake-line"],
    sources=[{"title": "Duesenberg 4-Wheel Hydraulic Braking System", "url": "https://www.asme.org/about-asme/engineering-history/landmarks/284-duesenberg-4-wheel-hydraulic-braking-system", "publisher": "ASME", "accessed": ACCESSED}])

add(id="gabriel-voisin", name="Gabriel Voisin", role="Experimenter with aircraft braking", year="1920", sortYear=1920, categoryId="brakes",
    headline="Tried to stop wheels locking up, on aircraft, in 1920.",
    story="In 1920 Gabriel Voisin experimented with modulating hydraulic brake pressure on aircraft brakes, using a flywheel and a valve to reduce tyre slippage; the same idea underlies anti-lock braking today. Karl Wässel patented a system in 1928 but never produced a working product, Dunlop's Maxaret was in widespread UK aviation use by the early 1950s, and Bosch's electronic four-wheel ABS became an option on the Mercedes-Benz W116 from 1978.",
    caution="Purely mechanical systems on cars (the Jensen FF, Ferguson P99 and an experimental Ford Zodiac) saw limited use in the 1960s and proved expensive and unreliable.",
    topicIds=["anti-lock-braking"], componentIds=["abs-modulator", "wheel-speed-sensor"], sources=[W("Anti-lock braking system", "Anti-lock_braking_system")])

add(id="earle-macpherson", name="Earle S. MacPherson", role="American automotive engineer", year="1947–1950", sortYear=1947, categoryId="suspension-steering",
    headline="Packaged a front suspension into one cheap, compact strut.",
    story="MacPherson became chief engineer of Chevrolet's Light Car project in 1945, but GM cancelled the Cadet in 1947, largely over forecast profit margins, and he moved to Ford. Patents followed: 1947 for GM and 1949 for Ford. The first production car with MacPherson struts was the British-built 1950 Ford Consul, followed by the Zephyr. Dropping the upper control arm leaves more room in the engine bay, and fewer joints means less to wear out.",
    caution="The French 1949 Vedette is commonly named as the first strut car, but the source says that is a misidentification.",
    topicIds=["suspension-basics", "springs-and-dampers"], componentIds=["damper", "coil-spring"], sources=[W("MacPherson strut", "MacPherson_strut")])

add(id="vincenzo-lancia", name="Vincenzo Lancia", role="Car maker behind the Lambda", year="1922", sortYear=1922, categoryId="body-chassis",
    headline="Built a car whose body was its own structure.",
    story="The Lancia Lambda, built from 1922 to 1931, is historically notable as the first car with a self-supporting unitary body. Its front suspension was independent, of the sliding-pillar type with coil springs, and its narrow-angle aluminium V4 used a single camshaft serving both cylinder banks. Vincenzo Lancia reportedly invented a shock absorber for the car, too.",
    caution="The source notes that the Lambda's roof was not stressed, so it was an early step towards the modern monocoque rather than the finished idea.",
    topicIds=["chassis-construction"], componentIds=[], sources=[W("Lancia Lambda", "Lancia_Lambda")])

add(id="alec-issigonis", name="Alec Issigonis", role="British-Greek car designer (1906–1988)", year="1959", sortYear=1959, categoryId="drivetrain",
    headline="Packed a whole car around a transverse engine.",
    story="Fuel rationing after the Suez Crisis in late 1956 prompted the Mini project, and BMC chairman Leonard Lord directed Issigonis to bring the small car, codenamed XC/9003, quickly into production. Launched in August 1959 as the Morris Mini Minor and Austin Seven, it combined front-wheel drive, a transverse engine, a gearbox in the sump and 10-inch wheels to get remarkable space efficiency from a tiny footprint. Issigonis was born in Smyrna (now İzmir) in 1906 and died in Birmingham in 1988.",
    topicIds=["drivetrain-layouts"], componentIds=[], sources=[W("Alec Issigonis", "Alec_Issigonis")])

add(id="emile-levassor", name="Émile Levassor", role="Car builder, Panhard et Levassor", year="1891", sortYear=1891, categoryId="drivetrain",
    headline="Moved the engine to the front and put a clutch pedal and gear stick in the driver's reach.",
    story="In 1886 the Belgian industrialist Édouard Sarazin obtained a licence to build Daimler engines and chose Levassor to build them in France. Levassor's 1891 Panhard moved the engine to the front, cooled it with a front-mounted radiator, linked it to the gearing with a crankshaft, and added a clutch pedal and a gear stick between the seats. The arrangement was soon called the 'système Panhard', which the source calls unfortunate for him. A crash while avoiding a dog in the 1896 Paris–Marseille–Paris race left him seriously injured, and he died in Paris in 1897.",
    caution="The cited biography does not say which of these features were wholly new in 1891.",
    topicIds=["drivetrain-layouts", "clutch", "manual-gearbox"], componentIds=[], sources=[W("Émile Levassor", "%C3%89mile_Levassor"), W("Système Panhard", "Syst%C3%A8me_Panhard")])

add(id="onesiphore-pecqueur", name="Onésiphore Pecqueur", role="Steam-wagon patentee", year="1827", sortYear=1827, categoryId="drivetrain",
    headline="Put a differential on a steam wagon's driven axle, one of many inventors of the idea.",
    story="Pecqueur's 1827 steam-wagon patent included a differential on the driven rear axle. The source says the device seems to have been reinvented many times: James Starley patented one for a quadricycle in 1876 and licensed Adolphe Clément to use it on motor vehicles in France, and Carl Benz devised a very similar design in 1885.",
    caution="The source does not say Pecqueur's was the first on a road vehicle, and treats the ancient south-pointing chariot of Ma Jun (about AD 250) as an uncertain case of a differential.",
    topicIds=["differential"], componentIds=["final-drive"], sources=[W("Differential (mechanical device)", "Differential_(mechanical_device)")])

add(id="hermann-fottinger", name="Hermann Föttinger", role="German engineer and inventor (1877–1945)", year="1905", sortYear=1905, categoryId="transmission",
    headline="Combined a pump and a turbine in one housing, the ancestor of the torque converter.",
    story="While chief designer at the AG Vulcan Stettin shipyard from 1904, Föttinger developed a fluid coupling that combined a pump and a turbine in a single unit. His 1905 patents covered both fluid couplings and torque converters, and the source says its further development produced the automatic car transmission. He filed more than 100 patent applications in his career.",
    topicIds=["automatic-transmission"], componentIds=[], sources=[W("Hermann Föttinger", "Hermann_F%C3%B6ttinger")])

add(id="bertha-benz", name="Bertha Benz", role="Wife of Carl Benz; driver of the 1888 trip", year="1888", sortYear=1888, categoryId="basics",
    headline="Proved a motor car could make a long trip, and told its maker what to fix.",
    story="On 5 August 1888 Bertha Benz drove from Mannheim to Pforzheim, about 106 km, with her sons Richard and Eugen, without telling her husband and without official permission. Officially she was visiting her mother; her real aim was to show Carl that the car could succeed commercially once the public saw it was useful. Ligroin, the solvent the car needed, was sold only by chemists, so she bought it at the pharmacy in Wiesloch. She cleared a blocked fuel line with her hatpin and used her garter as insulation, and afterwards suggested brake linings and an extra gear for hills.",
    caution="The source credits Carl Benz, not Bertha, with having a cobbler install leather brake linings.",
    topicIds=["how-a-car-works"], componentIds=[], sources=[W("Bertha Benz", "Bertha_Benz")])

add(id="john-boyd-dunlop", name="John Boyd Dunlop", role="Scottish veterinary surgeon in Belfast", year="1887–1889", sortYear=1887, categoryId="wheels-tyres",
    headline="Gave the bicycle an air-filled tyre.",
    story="In October 1887 Dunlop, a veterinary surgeon with a large practice on May Street in Belfast, developed the first practical pneumatic tyre for his son's tricycle and tested it in his yard. Willie Hume won the tyres' first races in 1889, including all four events at Queen's College Sports in Belfast on 18 May. Among the beaten riders were sons of Harvey Du Cros, who then partnered with Dunlop.",
    caution="Robert William Thomson patented a pneumatic tyre in 1847, and Dunlop's own 1888 patent was later declared invalid, about two years after it was granted.",
    topicIds=["tyres-and-grip"], componentIds=["wheel-and-tyre", "tyres"], sources=[W("John Boyd Dunlop", "John_Boyd_Dunlop")])

add(id="marius-mignol", name="Marius Mignol and Michelin", role="Michelin tyre developer", year="1946", sortYear=1946, categoryId="wheels-tyres",
    headline="Developed the first Michelin X radial car tyre.",
    story="Michelin designed, developed, patented and commercialised the radial tyre, and Marius Mignol developed the first Michelin X car radial in 1946. Its cords run at 90 degrees to the direction of travel. Michelin owned Citroën, which fitted radials to the 2CV from its 1948 launch. In 1968 Consumer Reports credited radials with longer tread life, better steering and lower rolling resistance, and a Ford engineer, Jack Bajer, adapted a 1960s Falcon's steering and added bushings to suit the radial's different feel.",
    caution="Earlier radial patents were filed by G. H. Hamilton and T. Sloper (London, 1914) and Arthur W. Savage (US, 1916), but no products were made.",
    topicIds=["tyres-and-grip"], componentIds=[], sources=[W("Radial tire", "Radial_tire")])

add(id="charles-kettering", name="Charles F. Kettering", role="American engineer, co-founder of Delco", year="1911–1912", sortYear=1911, categoryId="electrical",
    headline="Replaced the hand crank with an electric starter.",
    story="Kettering helped incorporate Delco (the Dayton Engineering Laboratories Company) in 1909 after leaving NCR. By February 1911 Delco had a working electric self-starter, and Cadillac's Henry Leland ordered 12,000 of them for the 1912 models, where Kettering's practical self-starter first appeared. A hand crank could kick back hard, which is the problem the starter solved.",
    caution="A popular story says Leland wanted the starter after Byron Carter died from complications of a cranking injury. The source flags that claim as dubious.",
    topicIds=["battery-and-starter"], componentIds=["starter-motor", "battery"], sources=[W("Charles F. Kettering", "Charles_F._Kettering")])

add(id="willis-carrier", name="Willis Carrier", role="Research engineer, Buffalo Forge Company", year="1902", sortYear=1902, categoryId="hvac",
    headline="Controlled humidity for a printing plant and invented modern air conditioning.",
    story="In 1902 Carrier submitted drawings for what the source calls the world's first modern air conditioning system. It solved a humidity problem at a Brooklyn lithographing company, where summer humidity made paper swell and shrink and ruined multicolour printing. He presented his 'Rational Psychrometric Formulae' to the American Society of Mechanical Engineers on 3 December 1911.",
    caution="The source concerns a printing plant, not a car: this is the origin of the technology rather than an automotive invention.",
    topicIds=["air-conditioning"], componentIds=[], sources=[W("Willis Carrier", "Willis_Carrier")])

add(id="wunibald-kamm", name="Wunibald Kamm", role="Automotive aerodynamicist, Stuttgart", year="1938", sortYear=1938, categoryId="aero-technology",
    headline="Showed that a chopped-off tail can behave like a long one.",
    story="The Kammback is a car body style based on Wunibald Kamm's research into reducing turbulence at high speed: keep a smooth roofline and taper, then cut the tail off abruptly. The airflow behaves almost as if the full tail were still there, so drag stays low without a long tapering body. In late summer 1938 BMW tested a 'Kamm-Coupé' prototype with a drag coefficient of 0.25, while the 1940 Mille Miglia-winning BMW 328 Touring Coupé measured 0.35. The Stuttgart research institute FKFS, established in 1930, was nicknamed the Kamm-Institut.",
    topicIds=["aerodynamics"], componentIds=[], sources=[W("Wunibald Kamm", "Wunibald_Kamm")])

add(id="ferdinand-porsche", name="Ferdinand Porsche", role="Young engineer at the Lohner works, Vienna", year="1900", sortYear=1900, categoryId="aero-technology",
    headline="Put electric motors in the wheel hubs, then added a petrol engine.",
    story="Porsche moved to Vienna at 18 in 1893 and was working at the Lohner factory by 23. The four-wheel-drive Lohner–Porsche electric coach, shown at the December 1900 Paris Exhibition, drove each wheel directly with a motor in its hub, a low-friction drivetrain, but it needed 1.8 tonnes of batteries. The 1900 'Mixte' racing car combined a petrol engine with four hub motors and is described as the first hybrid electric vehicle.",
    topicIds=["hybrid-and-electric-drives"], componentIds=[], sources=[W("Lohner–Porsche", "Lohner%E2%80%93Porsche")])

add(id="francis-davis", name="Francis W. Davis", role="Engineer at Pierce-Arrow", year="1926", sortYear=1926, categoryId="suspension-steering",
    headline="Built the first workable power steering, and General Motors found it too costly.",
    story="Francis W. Davis, an engineer at Pierce-Arrow, is credited with developing the first workable power steering system in 1926. Later, at General Motors, he refined it, but the company judged it too costly to produce. Chrysler's 1951 Imperial, sold with the Hydraguide system, was the first commercially available passenger car with power steering, and the heavy vehicles of World War II gave development another push.",
    caution="Robert E. Twyford's 1900 patent included a mechanical power steering mechanism, and the source also mentions an 1876 installation by someone named Fitts with few details known.",
    topicIds=["steering-systems"], componentIds=["steering-gear"], sources=[W("Power steering", "Power_steering")])

add(id="georg-lankensperger", name="Georg Lankensperger", role="Carriage builder, Munich", year="1816", sortYear=1816, categoryId="suspension-steering",
    headline="Worked out how the front wheels should turn, and lost the naming rights.",
    story="Lankensperger invented the geometry in Munich in 1816. The aim is for each wheel's axle to lie along a radius of circles sharing a common centre, so the tyres do not slip sideways in a turn, which means the inner wheel must turn through a greater angle than the outer. His English agent, Rudolph Ackermann (1764–1834), patented it in England in 1818 for horse-drawn carriages, and the geometry carries Ackermann's name today.",
    caution="Erasmus Darwin may have a prior claim, dating from 1758. Modern cars do not use pure Ackermann steering, partly because it ignores dynamic and compliance effects, though the principle still holds for low-speed manoeuvres.",
    topicIds=["steering-systems"], componentIds=["tie-rods"], sources=[W("Ackermann steering geometry", "Ackermann_steering_geometry")])

# drop empty optional keys for tidier JSON
out = []
for p in P:
    q = {k: v for k, v in p.items() if not (k == "caution" and not v)}
    out.append(q)
json.dump(out, open("src/content/pioneers.json", "w"), indent=2, ensure_ascii=False)
open("src/content/pioneers.json", "a").write("\n")
print(len(out), "pioneers written")
