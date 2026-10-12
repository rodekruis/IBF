export interface TeamsTextBlock {
  readonly type: 'TextBlock';
  readonly text: string;
  readonly weight?: 'Bolder';
  readonly size?: 'Medium' | 'Large';
  readonly color?: 'Attention';
  readonly isSubtle?: boolean;
  readonly wrap: boolean;
}

export interface TeamsFact {
  readonly title: string;
  readonly value: string;
}

interface TeamsFactSet {
  readonly type: 'FactSet';
  readonly facts: TeamsFact[];
}

export interface TeamsContainer {
  readonly type: 'Container';
  readonly separator: boolean;
  readonly items: (TeamsTextBlock | TeamsFactSet)[];
}

interface TeamsOpenUrlAction {
  readonly type: 'Action.OpenUrl';
  readonly title: string;
  readonly url: string;
}

export interface TeamsMention {
  readonly type: 'mention';
  readonly text: string;
  readonly mentioned: {
    readonly id: string;
    readonly name: string;
  };
}

interface TeamsAdaptiveCard {
  readonly $schema: string;
  readonly type: 'AdaptiveCard';
  readonly version: string;
  readonly body: (TeamsTextBlock | TeamsFactSet | TeamsContainer)[];
  readonly actions: TeamsOpenUrlAction[];
  readonly msteams: {
    readonly entities: TeamsMention[];
  };
}

export interface TeamsMessage {
  readonly type: 'message';
  readonly attachments: {
    readonly contentType: 'application/vnd.microsoft.card.adaptive';
    readonly content: TeamsAdaptiveCard;
  }[];
}
