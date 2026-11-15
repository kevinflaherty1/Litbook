// Every outbound product link goes through /go/<slug> so it can be changed in one place.
//
// Until a program approves you, `url` is the vendor's normal homepage (no commission).
// When approved, paste your affiliate/partner link into `url` and redeploy.
// Never click your own affiliate links to sign up for anything.
export type AffiliateLink = {
  slug: string;
  name: string;
  url: string;
  program: string; // where to apply
  approved: boolean;
};

export const links: AffiliateLink[] = [
  {
    slug: "jobber",
    name: "Jobber",
    url: "https://www.getjobber.com/",
    program: "PartnerStack (search 'Jobber')",
    approved: false,
  },
  {
    slug: "housecall-pro",
    name: "Housecall Pro",
    url: "https://www.housecallpro.com/",
    program: "PartnerStack (market.partnerstack.com/page/housecallpro)",
    approved: false,
  },
  {
    slug: "quoteiq",
    name: "QuoteIQ",
    url: "https://myquoteiq.com/",
    program: "myquoteiq.com/affiliates",
    approved: false,
  },
];
