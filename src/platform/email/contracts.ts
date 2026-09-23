import "server-only";

export interface InvitationDelivery {
  send(input: {
    email: string;
    universityName: string;
    invitationUrl: string;
    role?: "UNIVERSITY_ADMIN" | "REPRESENTATIVE";
  }): Promise<void>;
}
